package com.tersane.ppe.violation;

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
}
