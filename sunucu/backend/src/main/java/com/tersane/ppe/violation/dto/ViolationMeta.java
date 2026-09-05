package com.tersane.ppe.violation.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

import java.time.Instant;

public record ViolationMeta(
        @NotBlank String cameraId,
        @NotNull Instant detectedAt,
        double confidence,
        int bboxX,
        int bboxY,
        int bboxW,
        int bboxH,
        @NotBlank String trackId) {
}
