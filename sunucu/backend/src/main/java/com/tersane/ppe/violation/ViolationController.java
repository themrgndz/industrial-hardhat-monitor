package com.tersane.ppe.violation;

import com.tersane.ppe.storage.ImageStorage;
import com.tersane.ppe.violation.dto.ReviewRequest;
import com.tersane.ppe.violation.dto.ViolationMeta;
import com.tersane.ppe.violation.dto.ViolationView;
import jakarta.validation.Valid;
import org.springframework.core.io.Resource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;
import org.springframework.data.jpa.domain.Specification;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/violations")
public class ViolationController {

    private final ViolationRepository repository;
    private final ImageStorage imageStorage;
    private final ViolationCleanupService cleanupService;

    public ViolationController(ViolationRepository repository, ImageStorage imageStorage,
                                ViolationCleanupService cleanupService) {
        this.repository = repository;
        this.imageStorage = imageStorage;
        this.cleanupService = cleanupService;
    }

    @DeleteMapping
    public Map<String, Integer> deleteAll() {
        return Map.of("deleted", cleanupService.deleteAll());
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> deleteOne(@PathVariable UUID id) {
        return cleanupService.deleteById(id)
                ? ResponseEntity.noContent().build()
                : ResponseEntity.notFound().build();
    }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ResponseEntity<Map<String, UUID>> create(
            @RequestPart("meta") @Valid ViolationMeta meta,
            @RequestPart("image") MultipartFile image,
            @RequestPart(value = "crop", required = false) MultipartFile crop) throws IOException {

        Optional<Violation> existing = repository.findByCameraIdAndTrackIdAndDetectedAt(
                meta.cameraId(), meta.trackId(), meta.detectedAt());
        if (existing.isPresent()) {
            return ResponseEntity.ok(Map.of("id", existing.get().getId()));
        }

        String relativePath = imageStorage.save(meta.cameraId(), meta.detectedAt(), meta.trackId(), "", image.getBytes());
        String cropRelativePath = (crop != null && !crop.isEmpty())
                ? imageStorage.save(meta.cameraId(), meta.detectedAt(), meta.trackId(), "_crop", crop.getBytes())
                : null;
        Violation v = new Violation(
                meta.cameraId(), meta.detectedAt(), meta.confidence(),
                meta.bboxX(), meta.bboxY(), meta.bboxW(), meta.bboxH(),
                meta.trackId(), relativePath, cropRelativePath);
        try {
            repository.save(v);
        } catch (DataIntegrityViolationException e) {
            // eşzamanlı retry: aynı üçlü başka bir istek tarafından az önce kaydedildi
            Violation existingAfterRace = repository
                    .findByCameraIdAndTrackIdAndDetectedAt(meta.cameraId(), meta.trackId(), meta.detectedAt())
                    .orElseThrow(() -> e);
            return ResponseEntity.ok(Map.of("id", existingAfterRace.getId()));
        }
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", v.getId()));
    }

    @GetMapping
    public Map<String, Object> list(
            @RequestParam(defaultValue = "0") int page,
            @RequestParam(defaultValue = "20") int size,
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to,
            @RequestParam(required = false) String cameraId,
            @RequestParam(defaultValue = "confirmed") String status) {

        int cappedSize = Math.min(size, 100);
        Specification<Violation> spec = Specification.allOf();
        if (from != null) {
            spec = spec.and((root, query, cb) -> cb.greaterThanOrEqualTo(root.get("detectedAt"), from));
        }
        if (to != null) {
            spec = spec.and((root, query, cb) -> cb.lessThan(root.get("detectedAt"), to));
        }
        if (cameraId != null && !cameraId.isBlank()) {
            spec = spec.and((root, query, cb) -> cb.equal(root.get("cameraId"), cameraId));
        }

        String normalizedStatus = status.toUpperCase(Locale.ROOT);
        switch (normalizedStatus) {
            case "CONFIRMED", "REJECTED" -> {
                ReviewStatus rs = ReviewStatus.valueOf(normalizedStatus);
                spec = spec.and((root, query, cb) -> cb.equal(root.get("reviewStatus"), rs));
            }
            case "ALL" -> { /* filtre yok */ }
            default -> throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Geçersiz status değeri: " + status + ". Beklenen: confirmed, rejected, all");
        }

        var pageResult = repository.findAll(spec,
                PageRequest.of(page, cappedSize, Sort.by(Sort.Direction.DESC, "detectedAt")));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("content", pageResult.getContent().stream().map(ViolationView::from).toList());
        body.put("page", pageResult.getNumber());
        body.put("size", pageResult.getSize());
        body.put("totalElements", pageResult.getTotalElements());
        body.put("totalPages", pageResult.getTotalPages());
        return body;
    }

    @PatchMapping("/{id}/review")
    public ResponseEntity<ViolationView> review(
            @PathVariable UUID id,
            @RequestBody @Valid ReviewRequest req) {

        Violation violation = repository.findById(id)
                .orElseThrow(() -> new ResponseStatusException(HttpStatus.NOT_FOUND,
                        "İhlal bulunamadı: " + id));
        violation.review(req.status(), Instant.now());
        repository.save(violation);
        return ResponseEntity.ok(ViolationView.from(violation));
    }

    @GetMapping("/{id}/image")
    public ResponseEntity<Resource> image(@PathVariable UUID id) {
        return repository.findById(id)
                .map(v -> imageStorage.load(v.getImagePath()))
                .map(resource -> ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).body(resource))
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/{id}/crop")
    public ResponseEntity<Resource> crop(@PathVariable UUID id) {
        return repository.findById(id)
                .map(Violation::getCropPath)
                .filter(path -> path != null && !path.isBlank())
                .map(imageStorage::load)
                .map(resource -> ResponseEntity.ok().contentType(MediaType.IMAGE_JPEG).body(resource))
                .orElse(ResponseEntity.notFound().build());
    }
}
