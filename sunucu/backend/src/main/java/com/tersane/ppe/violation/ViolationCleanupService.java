package com.tersane.ppe.violation;

import com.tersane.ppe.storage.ImageStorage;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** İhlal geçmişini (DB satırı + kanıt görselleri) birlikte siler — manuel "tümünü sil"
 * eylemi, tekil "ihlal değil" reddi (bkz. ViolationController) ve otomatik saklama-süresi
 * temizliği aynı yolu kullanır. */
@Service
public class ViolationCleanupService {

    private final ViolationRepository repository;
    private final ImageStorage imageStorage;

    public ViolationCleanupService(ViolationRepository repository, ImageStorage imageStorage) {
        this.repository = repository;
        this.imageStorage = imageStorage;
    }

    public int deleteAll() {
        return deleteAndCountFiles(repository.findAll());
    }

    public int deleteOlderThan(Instant cutoff) {
        return deleteAndCountFiles(repository.findByDetectedAtBefore(cutoff));
    }

    /** Tek kaydı kalıcı siler (dosya + DB). Bulunamazsa false döner. */
    public boolean deleteById(UUID id) {
        return repository.findById(id)
                .map(v -> {
                    imageStorage.delete(v.getImagePath());
                    imageStorage.delete(v.getCropPath());
                    repository.delete(v);
                    return true;
                })
                .orElse(false);
    }

    private int deleteAndCountFiles(List<Violation> victims) {
        if (victims.isEmpty()) {
            return 0;
        }
        for (Violation v : victims) {
            imageStorage.delete(v.getImagePath());
            imageStorage.delete(v.getCropPath());
        }
        repository.deleteAllInBatch(victims);
        return victims.size();
    }
}
