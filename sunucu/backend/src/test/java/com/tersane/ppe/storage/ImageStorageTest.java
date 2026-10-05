package com.tersane.ppe.storage;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;

import static org.junit.jupiter.api.Assertions.assertEquals;

/** `usedBytes()` artık her çağrıda `Files.walk` ile tüm depoyu taramıyor;
 * `save()`/`delete()` tarafından artımlı güncellenen bir sayaç döndürüyor
 * (bkz. ImageStorage sınıf yorumu). Bu testler sayacın gerçek disk durumuyla
 * tutarlı kaldığını doğrular — makul bir bug (artırmayı/azaltmayı unutmak,
 * yanlış sırada silmek) burada fail eder. */
class ImageStorageTest {

    @Test
    void seedsFromExistingFilesOnConstruction(@TempDir Path tmp) throws IOException {
        // yeniden başlatma senaryosu: disk üzerinde zaten dosyalar var,
        // sayaç henüz hiç save()/delete() görmedi.
        Path existing = tmp.resolve("ihlal/01.01.2026/cam1/old.jpg");
        Files.createDirectories(existing.getParent());
        Files.write(existing, new byte[500]);

        ImageStorage storage = new ImageStorage(tmp.toString());

        assertEquals(500L, storage.usedBytes(), "kurucu, diskteki mevcut dosyaları tarayıp sayacı tohumlamalı");
    }

    @Test
    void saveIncrementsAndDeleteDecrementsUsedBytes(@TempDir Path tmp) throws IOException {
        ImageStorage storage = new ImageStorage(tmp.toString());
        assertEquals(0L, storage.usedBytes());

        String path1 = storage.save("cam1", Instant.now(), "t1", "", new byte[1000]);
        assertEquals(1000L, storage.usedBytes(), "save() sonrası sayaç artmalı");

        String path2 = storage.save("cam1", Instant.now(), "t2", "_crop", new byte[300]);
        assertEquals(1300L, storage.usedBytes(), "ikinci save() sayaca eklenmeli");

        storage.delete(path1);
        assertEquals(300L, storage.usedBytes(), "delete() sonrası sayaç azalmalı");

        storage.delete(path2);
        assertEquals(0L, storage.usedBytes(), "tüm dosyalar silinince sayaç sıfıra dönmeli");
    }

    @Test
    void deletingMissingPathDoesNotUnderflowCounter(@TempDir Path tmp) {
        ImageStorage storage = new ImageStorage(tmp.toString());

        storage.delete("ihlal/hic/olmayan/dosya.jpg");

        assertEquals(0L, storage.usedBytes(), "var olmayan yolu silmek sayacı negatife düşürmemeli");
    }

    @Test
    void resyncCorrectsDriftFromOutOfBandFileChanges(@TempDir Path tmp) throws IOException {
        ImageStorage storage = new ImageStorage(tmp.toString());
        storage.save("cam1", Instant.now(), "t1", "", new byte[1000]);
        assertEquals(1000L, storage.usedBytes());

        // API DIŞI müdahale: operatör elle bir dosya ekliyor (ör. yedekten geri
        // yükleme). Sayaç bunu bilemez, gerçek disk durumundan sapar.
        Path manual = tmp.resolve("ihlal/elle-eklenen.jpg");
        Files.write(manual, new byte[250]);
        assertEquals(1000L, storage.usedBytes(), "elle eklenen dosya resync'ten önce sayaca yansımamalı");

        storage.resync();

        assertEquals(1250L, storage.usedBytes(), "resync() sayacı gerçek disk durumuna düzeltmeli");
    }
}
