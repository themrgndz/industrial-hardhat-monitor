package com.tersane.ppe.stats;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDFont;
import org.apache.pdfbox.pdmodel.font.PDType0Font;
import org.springframework.stereotype.Component;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * Günlük ihlal raporunu PDF olarak üretir. Türkçe karakterler (ç,ğ,ı,ö,ş,ü,İ)
 * standart 14 PDF fontuyla (WinAnsiEncoding) doğru gösterilmiyor — bu yüzden
 * tam Unicode kapsamı olan Noto Sans gömülü font olarak kullanılıyor
 * (src/main/resources/fonts, SIL Open Font License).
 */
@Component
class ReportPdfService {

    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("dd.MM.yyyy");
    private static final DateTimeFormatter TIME_FMT = DateTimeFormatter.ofPattern("HH:mm:ss");
    private static final float MARGIN = 50f;
    private static final float LINE_HEIGHT = 16f;

    byte[] render(String reportDate, long totalDetections, long confirmedCount,
                  List<Map<String, Object>> confirmed, Map<String, String> cameraNames) throws IOException {
        try (PDDocument doc = new PDDocument()) {
            PDFont regular = loadFont(doc, "/fonts/NotoSans-Regular.ttf");
            PDFont bold = loadFont(doc, "/fonts/NotoSans-Bold.ttf");
            ZonedDateTime now = ZonedDateTime.now(ISTANBUL);

            PageCursor cursor = new PageCursor(doc);
            cursor.text(bold, 16, "Günlük İhlal Raporu");
            cursor.gap();
            cursor.text(regular, 11, "Oluşturulma Tarihi - Saati: " + DATE_FMT.format(now) + " - " + TIME_FMT.format(now));
            cursor.text(regular, 11, "Rapor Tarihi: " + reportDate);
            cursor.gap();
            cursor.text(bold, 11, "Toplam Tespit: " + totalDetections + "    Onaylanan: " + confirmedCount);
            cursor.gap();

            if (confirmed.isEmpty()) {
                cursor.text(regular, 11, "Bu tarihte onaylanmış ihlal yok.");
            } else {
                cursor.text(bold, 10, pad("Tarih", 13) + pad("Saat", 11) + "Kamera");
                for (Map<String, Object> row : confirmed) {
                    Instant detectedAt = Instant.parse(String.valueOf(row.get("detectedAt")));
                    ZonedDateTime zdt = detectedAt.atZone(ISTANBUL);
                    String cameraId = String.valueOf(row.get("cameraId"));
                    String cameraName = cameraNames.getOrDefault(cameraId, cameraId);
                    cursor.text(regular, 10,
                            pad(DATE_FMT.format(zdt), 13) + pad(TIME_FMT.format(zdt), 11) + cameraName);
                }
            }

            cursor.close();

            ByteArrayOutputStream out = new ByteArrayOutputStream();
            doc.save(out);
            return out.toByteArray();
        }
    }

    private static String pad(String s, int width) {
        return s.length() >= width ? s + "  " : s + " ".repeat(width - s.length());
    }

    private static PDFont loadFont(PDDocument doc, String classpath) throws IOException {
        try (InputStream in = ReportPdfService.class.getResourceAsStream(classpath)) {
            if (in == null) {
                throw new IOException("font bulunamadı (classpath): " + classpath);
            }
            return PDType0Font.load(doc, in);
        }
    }

    /** Sayfa taşarsa otomatik yeni sayfa açan basit metin imleci. */
    private static final class PageCursor {
        private final PDDocument doc;
        private PDPageContentStream stream;
        private float y;

        PageCursor(PDDocument doc) throws IOException {
            this.doc = doc;
            newPage();
        }

        private void newPage() throws IOException {
            if (stream != null) {
                stream.close();
            }
            PDPage page = new PDPage(PDRectangle.A4);
            doc.addPage(page);
            stream = new PDPageContentStream(doc, page);
            y = page.getMediaBox().getHeight() - MARGIN;
        }

        void gap() {
            y -= LINE_HEIGHT * 0.5f;
        }

        void text(PDFont font, float size, String text) throws IOException {
            if (y < MARGIN) {
                newPage();
            }
            stream.beginText();
            stream.setFont(font, size);
            stream.newLineAtOffset(MARGIN, y);
            stream.showText(text);
            stream.endText();
            y -= LINE_HEIGHT;
        }

        void close() throws IOException {
            stream.close();
        }
    }
}
