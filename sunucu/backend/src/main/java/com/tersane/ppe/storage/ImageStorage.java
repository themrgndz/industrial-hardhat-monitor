package com.tersane.ppe.storage;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.concurrent.atomic.AtomicLong;

@Component
public class ImageStorage {

    private static final Logger log = LoggerFactory.getLogger(ImageStorage.class);
    private static final ZoneId UTC = ZoneId.of("UTC");
    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final DateTimeFormatter STAMP_FMT = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");

    private final Path storageRoot;
    // `usedBytes()` ViolationRetentionScheduler tarafından her 15 dakikada bir
    // çağrılıyor; önceden her çağrıda `Files.walk(storageRoot)` ile TÜM ağacı
    // baştan tarıyordu — dosya sayısı (3 günlük/binlerce ihlal) arttıkça bu
    // tarama CPU/IO maliyeti doğrusal büyürdü. Şimdi save()/delete() bu
    // sayacı artımlı günceller, usedBytes() O(1). Başlangıçta (ve `resync()`
    // ile periyodik olarak) gerçek diskten tek seferlik tam tarama yapılıp
    // sayaç gerçeğe senkronlanır — elle dosya silme/taşıma gibi API dışı
    // müdahalelerden doğabilecek sapmayı (drift) giderir.
    private final AtomicLong usedBytes = new AtomicLong();

    public ImageStorage(@Value("${app.storage-root}") String storageRoot) {
        this.storageRoot = Path.of(storageRoot).toAbsolutePath().normalize();
        this.usedBytes.set(scanUsedBytes());
    }

    public String save(String cameraId, Instant detectedAt, String trackId, String suffix, byte[] jpeg) throws IOException {
        var zoned = detectedAt.atZone(UTC);
        String day = DAY_FMT.format(zoned);
        String stamp = STAMP_FMT.format(zoned);
        // ihlal/{gün.ay.yıl}/{kamera}/{zaman damgası}_{track}[_crop].jpg — kullanıcı isteği:
        // onaylı ihlaller ve loglar tarih -> kamera olarak alt klasörlenir.
        String relative = "ihlal/%s/%s/%s_%s%s.jpg".formatted(day, cameraId, stamp, trackId, suffix);
        Path target = storageRoot.resolve(relative).normalize();
        if (!target.startsWith(storageRoot)) {
            throw new IOException("hesaplanan yol depolama kökü dışına çıkıyor: " + relative);
        }
        Files.createDirectories(target.getParent());
        Files.write(target, jpeg);
        usedBytes.addAndGet(jpeg.length);
        return relative;
    }

    public Resource load(String relativePath) {
        Path target = storageRoot.resolve(relativePath).normalize();
        if (!target.startsWith(storageRoot)) {
            return null;
        }
        if (!Files.isRegularFile(target)) {
            return null;
        }
        return new FileSystemResource(target);
    }

    /** Dosyayı siler; yoksa veya kök dışına çıkıyorsa sessizce no-op (satır zaten kayboluyor). */
    public void delete(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            return;
        }
        Path target = storageRoot.resolve(relativePath).normalize();
        if (!target.startsWith(storageRoot)) {
            return;
        }
        // Boyutu SİLMEDEN önce al — sonra dosya artık yok, Files.size() hata verir.
        long size = sizeQuiet(target);
        try {
            if (Files.deleteIfExists(target) && size > 0) {
                usedBytes.addAndGet(-size);
            }
        } catch (IOException e) {
            // diskte kalması veri kaybı değil, en fazla yer israfı — DB satırı yine de silinsin
        }
    }

    /** `storage-root` altındaki tüm dosyaların toplam boyutu (bayt) — temizlik eşiği için.
     * O(1): save()/delete() tarafından artımlı güncellenen sayaç döner (bkz. sınıf
     * yorumu); periyodik tam tarama yerine her 15 dk'lık temizlik taramasında
     * ucuz bir okuma haline gelir. */
    public long usedBytes() {
        return usedBytes.get();
    }

    /** Göreli yolun bayt boyutu; dosya yoksa/okunamazsa 0. */
    public long sizeOf(String relativePath) {
        if (relativePath == null || relativePath.isBlank()) {
            return 0L;
        }
        Path target = storageRoot.resolve(relativePath).normalize();
        if (!target.startsWith(storageRoot)) {
            return 0L;
        }
        return sizeQuiet(target);
    }

    /** Sayacı gerçek diskten tam tarama ile yeniden senkronlar — API dışı elle
     * müdahale (manuel dosya silme/taşıma, crash sonrası tutarsızlık) ihtimaline
     * karşı periyodik düzeltme. 15 dk'lık temizlik taramasından çok daha seyrek
     * (6 saatte bir) çalışır; maliyeti artık nadir, sabit bir arka plan işi. */
    @Scheduled(fixedRate = 21_600_000L)
    public void resync() {
        long fresh = scanUsedBytes();
        long previous = usedBytes.getAndSet(fresh);
        if (previous != fresh) {
            log.info("depolama bayt sayacı yeniden senkronlandı: {} -> {} (sapma={})",
                    previous, fresh, fresh - previous);
        }
    }

    private long scanUsedBytes() {
        if (!Files.isDirectory(storageRoot)) {
            return 0L;
        }
        try (var stream = Files.walk(storageRoot)) {
            return stream.filter(Files::isRegularFile)
                    .mapToLong(this::sizeQuiet)
                    .sum();
        } catch (IOException e) {
            return 0L;
        }
    }

    private long sizeQuiet(Path p) {
        try {
            return Files.size(p);
        } catch (IOException e) {
            return 0L;
        }
    }
}
