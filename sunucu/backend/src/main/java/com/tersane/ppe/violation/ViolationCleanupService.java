package com.tersane.ppe.violation;

import com.tersane.ppe.storage.ImageStorage;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** İhlal geçmişini (DB satırı + kanıt görselleri) birlikte siler — manuel "tümünü sil"
 * eylemi, tekil "ihlal değil" reddi (bkz. ViolationController), saklama-süresi (yaş) ve
 * depolama-tavanı (boyut) temizlikleri (bkz. ViolationRetentionScheduler) aynı yolu kullanır. */
@Service
public class ViolationCleanupService {

    private static final int SIZE_CLEANUP_PAGE_SIZE = 50;

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

    /** En eski kayıtlardan başlayarak en az `targetBytes` kadar yer açılana kadar siler
     * (dosya + DB). Depolama tavanı aşıldığında (bkz. ViolationRetentionScheduler) çağrılır.
     * Döndürdüğü değer fiilen silinen bayt miktarıdır. */
    public long deleteOldestUntilFreed(long targetBytes) {
        long freed = 0L;
        while (freed < targetBytes) {
            List<Violation> batch = repository
                    .findAllByOrderByDetectedAtAsc(PageRequest.of(0, SIZE_CLEANUP_PAGE_SIZE))
                    .getContent();
            if (batch.isEmpty()) {
                break;
            }
            for (Violation v : batch) {
                freed += imageStorage.sizeOf(v.getImagePath()) + imageStorage.sizeOf(v.getCropPath());
                imageStorage.delete(v.getImagePath());
                imageStorage.delete(v.getCropPath());
            }
            repository.deleteAllInBatch(batch);
        }
        return freed;
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
