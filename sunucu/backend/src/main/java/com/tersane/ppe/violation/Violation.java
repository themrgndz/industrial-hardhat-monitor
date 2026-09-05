package com.tersane.ppe.violation;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Index;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;
import jakarta.persistence.UniqueConstraint;

import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "violations",
        uniqueConstraints = @UniqueConstraint(
                name = "uk_violation_ident",
                columnNames = {"camera_id", "track_id", "detected_at"}),
        indexes = {
                @Index(name = "ix_violations_detected_at", columnList = "detected_at DESC"),
                @Index(name = "ix_violations_camera_id", columnList = "camera_id"),
                @Index(name = "ix_violations_review_status", columnList = "review_status")
        })
public class Violation {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @Column(name = "camera_id", length = 64, nullable = false)
    private String cameraId;

    @Column(name = "detected_at", nullable = false)
    private Instant detectedAt;

    @Column(nullable = false)
    private double confidence;

    @Column(name = "bbox_x", nullable = false)
    private int bboxX;

    @Column(name = "bbox_y", nullable = false)
    private int bboxY;

    @Column(name = "bbox_w", nullable = false)
    private int bboxW;

    @Column(name = "bbox_h", nullable = false)
    private int bboxH;

    @Column(name = "track_id", length = 64)
    private String trackId;

    @Column(name = "image_path", columnDefinition = "text", nullable = false)
    private String imagePath;

    @Column(name = "crop_path", columnDefinition = "text")
    private String cropPath;

    @Enumerated(EnumType.STRING)
    @Column(name = "review_status", nullable = false, length = 16,
            columnDefinition = "varchar(16) not null default 'CONFIRMED'")
    private ReviewStatus reviewStatus = ReviewStatus.CONFIRMED;

    @Column(name = "reviewed_at")
    private Instant reviewedAt;

    @Column(name = "created_at", nullable = false)
    private Instant createdAt;

    protected Violation() {
        // JPA
    }

    public Violation(String cameraId, Instant detectedAt, double confidence,
                      int bboxX, int bboxY, int bboxW, int bboxH,
                      String trackId, String imagePath, String cropPath) {
        this.cameraId = cameraId;
        this.detectedAt = detectedAt;
        this.confidence = confidence;
        this.bboxX = bboxX;
        this.bboxY = bboxY;
        this.bboxW = bboxW;
        this.bboxH = bboxH;
        this.trackId = trackId;
        this.imagePath = imagePath;
        this.cropPath = cropPath;
    }

    @PrePersist
    void onCreate() {
        this.createdAt = Instant.now();
    }

    public void review(ReviewStatus status, Instant at) {
        this.reviewStatus = status;
        this.reviewedAt = at;
    }

    public UUID getId() {
        return id;
    }

    public String getCameraId() {
        return cameraId;
    }

    public Instant getDetectedAt() {
        return detectedAt;
    }

    public double getConfidence() {
        return confidence;
    }

    public int getBboxX() {
        return bboxX;
    }

    public int getBboxY() {
        return bboxY;
    }

    public int getBboxW() {
        return bboxW;
    }

    public int getBboxH() {
        return bboxH;
    }

    public String getTrackId() {
        return trackId;
    }

    public String getImagePath() {
        return imagePath;
    }

    public String getCropPath() {
        return cropPath;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public ReviewStatus getReviewStatus() {
        return reviewStatus;
    }

    public Instant getReviewedAt() {
        return reviewedAt;
    }
}
