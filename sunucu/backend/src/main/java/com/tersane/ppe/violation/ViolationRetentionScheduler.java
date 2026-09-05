package com.tersane.ppe.violation;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

/** Kayan pencere: 2 günden eski ihlal geçmişi (DB + görsel) her gün otomatik silinir —
 * kullanıcı isteği: "gün aşırı otomatik temizlensin", geçmiş süresiz birikmesin. */
@Component
public class ViolationRetentionScheduler {

    private static final Logger log = LoggerFactory.getLogger(ViolationRetentionScheduler.class);
    private static final int RETENTION_DAYS = 2;

    private final ViolationCleanupService cleanupService;

    public ViolationRetentionScheduler(ViolationCleanupService cleanupService) {
        this.cleanupService = cleanupService;
    }

    @Scheduled(cron = "0 0 3 * * *", zone = "Europe/Istanbul")
    public void purgeOldViolations() {
        Instant cutoff = Instant.now().minus(RETENTION_DAYS, ChronoUnit.DAYS);
        int deleted = cleanupService.deleteOlderThan(cutoff);
        if (deleted > 0) {
            log.info("otomatik temizlik: {} gün öncesinden eski {} ihlal kaydı silindi", RETENTION_DAYS, deleted);
        }
    }
}
