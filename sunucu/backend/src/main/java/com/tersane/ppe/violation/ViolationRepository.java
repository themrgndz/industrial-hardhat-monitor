package com.tersane.ppe.violation;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.JpaSpecificationExecutor;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface ViolationRepository
        extends JpaRepository<Violation, UUID>, JpaSpecificationExecutor<Violation> {

    Optional<Violation> findByCameraIdAndTrackIdAndDetectedAt(
            String cameraId, String trackId, Instant detectedAt);

    List<Violation> findByDetectedAtBefore(Instant cutoff);

    /** En eski ihlalden başlayarak sayfalı — boyut-tabanlı temizlikte kullanılır. */
    Page<Violation> findAllByOrderByDetectedAtAsc(Pageable pageable);
}
