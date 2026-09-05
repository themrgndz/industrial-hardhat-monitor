package com.tersane.ppe.violation.dto;

import com.tersane.ppe.violation.ReviewStatus;
import jakarta.validation.constraints.NotNull;

public record ReviewRequest(@NotNull ReviewStatus status) {
}
