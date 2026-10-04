package com.tersane.ppe.violation;

import com.tersane.ppe.storage.ImageStorage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/** Kayan pencere + depolama tavanı: `violation-retention-hours`'tan eski ihlal geçmişi
 * (DB + görsel) periyodik olarak otomatik silinir; buna rağmen toplam görsel boyutu
 * `violation-storage-max-bytes`'ı aşarsa en eski kayıtlardan en az `violation-storage-free-bytes`
 * kadar yer açılana dek ek silme yapılır. Kullanıcı isteği: geçmiş süresiz birikmesin,
 * disk sınırsız dolmasın. */
@Component
public class ViolationRetentionScheduler {

    private static final Logger log = LoggerFactory.getLogger(ViolationRetentionScheduler.class);

    private final ViolationCleanupService cleanupService;
    private final ImageStorage imageStorage;
    private final int retentionHours;
    private final long maxBytes;
    private final long freeBytes;

    public ViolationRetentionScheduler(
            ViolationCleanupService cleanupService,
            ImageStorage imageStorage,
            @Value("${app.violation-retention-hours}") int retentionHours,
            @Value("${app.violation-storage-max-bytes}") long maxBytes,
            @Value("${app.violation-storage-free-bytes}") long freeBytes) {
        this.cleanupService = cleanupService;
        this.imageStorage = imageStorage;
        this.retentionHours = retentionHours;
        this.maxBytes = maxBytes;
        this.freeBytes = freeBytes;
    }

    @Scheduled(fixedRateString = "${app.violation-cleanup-interval-ms}")
    public void enforceRetention() {
        Instant cutoff = Instant.now().minus(retentionHours, ChronoUnit.HOURS);
        int deletedByAge = cleanupService.deleteOlderThan(cutoff);
        if (deletedByAge > 0) {
            log.info("yaş temizliği: {} saatten eski {} ihlal kaydı silindi", retentionHours, deletedByAge);
        }

        long used = imageStorage.usedBytes();
        if (used > maxBytes) {
            long freed = cleanupService.deleteOldestUntilFreed(freeBytes);
            log.info(
                    "depolama tavanı aşıldı (kullanılan={} bayt, tavan={} bayt): en eskiden {} bayt silindi",
                    used, maxBytes, freed);
        }
    }
}
