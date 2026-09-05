package com.tersane.ppe.violation.dto;

import com.tersane.ppe.violation.ReviewStatus;
import com.tersane.ppe.violation.Violation;

import java.time.Instant;
import java.util.UUID;

public record ViolationView(
        UUID id,
        String cameraId,
        Instant detectedAt,
        double confidence,
        int bboxX,
        int bboxY,
        int bboxW,
        int bboxH,
        String trackId,
        boolean hasCrop,
        ReviewStatus reviewStatus) {

    public static ViolationView from(Violation v) {
        return new ViolationView(
                v.getId(), v.getCameraId(), v.getDetectedAt(), v.getConfidence(),
                v.getBboxX(), v.getBboxY(), v.getBboxW(), v.getBboxH(), v.getTrackId(),
                v.getCropPath() != null && !v.getCropPath().isBlank(),
                v.getReviewStatus());
    }
}
