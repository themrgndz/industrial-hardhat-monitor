package com.tersane.ppe.violation;

import com.tersane.ppe.storage.ImageStorage;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.PageRequest;

import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.when;

class ViolationCleanupServiceTest {

    private static Violation violation(String imagePath) {
        return new Violation("cam1", Instant.now(), 0.9, 0, 0, 10, 10, "t1", imagePath, "");
    }

    /** Silme sayfa (50 kayıt) bazlı yapılır — hedef bir sayfanın ortasında değil,
     * sayfa sınırında kontrol edilir. 120 kayıt, sayfa başına 1000 bayt (50x20);
     * hedef 1500 olunca: 1. sayfa (1000, yetmez) + 2. sayfa (2000, yeter) silinir,
     * 3. sayfadaki 20 kayıt dokunulmaz kalır. */
    @Test
    void stopsAfterPageThatMeetsTargetBytes() {
        ViolationRepository repo = Mockito.mock(ViolationRepository.class);
        ImageStorage storage = Mockito.mock(ImageStorage.class);

        List<Violation> remaining = new java.util.ArrayList<>();
        for (int i = 0; i < 120; i++) {
            remaining.add(violation("v" + i + ".jpg"));
        }

        when(storage.sizeOf(any())).thenReturn(10L); // image + crop = 20/kayıt
        when(repo.findAllByOrderByDetectedAtAsc(any(PageRequest.class))).thenAnswer(inv -> {
            PageRequest pr = inv.getArgument(0);
            List<Violation> page = remaining.stream().limit(pr.getPageSize()).toList();
            return (Page<Violation>) new PageImpl<>(page);
        });
        Mockito.doAnswer(inv -> {
            List<Violation> victims = inv.getArgument(0);
            remaining.removeAll(victims);
            return null;
        }).when(repo).deleteAllInBatch(any());

        ViolationCleanupService service = new ViolationCleanupService(repo, storage);
        long freed = service.deleteOldestUntilFreed(1500L);

        assertEquals(2000L, freed, "2 sayfa (100 kayıt) silinmeli, hedefi ilk aşan sayfa sınırı");
        assertEquals(20, remaining.size(), "3. sayfadaki kayıtlar dokunulmamış kalmalı");
    }

    /** Silinecek kayıt kalmayınca (repository boş sayfa döndürünce) sonsuz döngüye
     * girmeden durmalı — hedefe asla ulaşılamasa bile. */
    @Test
    void terminatesWhenNoMoreRecordsEvenIfTargetUnmet() {
        ViolationRepository repo = Mockito.mock(ViolationRepository.class);
        ImageStorage storage = Mockito.mock(ImageStorage.class);

        when(storage.sizeOf(any())).thenReturn(10L);
        when(repo.findAllByOrderByDetectedAtAsc(any(PageRequest.class)))
                .thenReturn(new PageImpl<>(List.of())); // hep boş

        ViolationCleanupService service = new ViolationCleanupService(repo, storage);
        long freed = service.deleteOldestUntilFreed(1_000_000L);

        assertEquals(0L, freed);
        Mockito.verify(repo, Mockito.never()).deleteAllInBatch(any());
    }
}
