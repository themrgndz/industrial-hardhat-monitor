package com.tersane.ppe.storage;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;

@Component
public class ImageStorage {

    private static final ZoneId UTC = ZoneId.of("UTC");
    private static final DateTimeFormatter DAY_FMT = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final DateTimeFormatter STAMP_FMT = DateTimeFormatter.ofPattern("yyyyMMdd'T'HHmmss'Z'");

    private final Path storageRoot;

    public ImageStorage(@Value("${app.storage-root}") String storageRoot) {
        this.storageRoot = Path.of(storageRoot).toAbsolutePath().normalize();
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
        try {
            Files.deleteIfExists(target);
        } catch (IOException e) {
            // diskte kalması veri kaybı değil, en fazla yer israfı — DB satırı yine de silinsin
        }
    }
}
