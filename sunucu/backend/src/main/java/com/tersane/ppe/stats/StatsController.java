package com.tersane.ppe.stats;

import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/stats")
public class StatsController {

    private static final ZoneId ISTANBUL = ZoneId.of("Europe/Istanbul");

    private final JdbcTemplate jdbc;
    private final ReportPdfService pdfService;

    public StatsController(JdbcTemplate jdbc, ReportPdfService pdfService) {
        this.jdbc = jdbc;
        this.pdfService = pdfService;
    }

    @GetMapping("/summary")
    public Map<String, Object> summary(
            @RequestParam(required = false) Instant from,
            @RequestParam(required = false) Instant to) {

        Instant rangeTo = to != null ? to : Instant.now();
        Instant rangeFrom = from != null ? from : rangeTo.minus(24, ChronoUnit.HOURS);

        Instant todayStart = ZonedDateTime.now(ISTANBUL).toLocalDate().atStartOfDay(ISTANBUL).toInstant();
        Instant lastHourStart = Instant.now().minus(1, ChronoUnit.HOURS);

        Long total = jdbc.queryForObject(
                "select count(*) from violations where detected_at >= ? and detected_at < ? and review_status <> 'REJECTED'",
                Long.class, Timestamp.from(rangeFrom), Timestamp.from(rangeTo));
        Long today = jdbc.queryForObject(
                "select count(*) from violations where detected_at >= ? and review_status <> 'REJECTED'",
                Long.class, Timestamp.from(todayStart));
        Long lastHour = jdbc.queryForObject(
                "select count(*) from violations where detected_at >= ? and review_status <> 'REJECTED'",
                Long.class, Timestamp.from(lastHourStart));

        Map<String, Long> byCamera = new LinkedHashMap<>();
        jdbc.query(
                "select camera_id, count(*) c from violations where detected_at >= ? and detected_at < ? and review_status <> 'REJECTED' group by camera_id",
                rs -> {
                    byCamera.put(rs.getString("camera_id"), rs.getLong("c"));
                },
                Timestamp.from(rangeFrom), Timestamp.from(rangeTo));

        Map<String, Long> byHour = new LinkedHashMap<>();
        jdbc.query(
                "select date_trunc('hour', detected_at) as h, count(*) c from violations "
                        + "where detected_at >= ? and detected_at < ? and review_status <> 'REJECTED' group by h order by h",
                rs -> {
                    byHour.put(rs.getTimestamp("h").toInstant().toString(), rs.getLong("c"));
                },
                Timestamp.from(rangeFrom), Timestamp.from(rangeTo));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("total", total);
        body.put("today", today);
        body.put("lastHour", lastHour);
        body.put("byCamera", byCamera);
        body.put("byHour", byHour);
        return body;
    }

    // Gün içi rapor verisi: toplam tespit, onaylanan sayısı, onaylananların
    // saat/kamera listesi. "Onaylanan" burada review_status = CONFIRMED demek
    // — yeni ihlaller varsayılan CONFIRMED doğar (bkz. OTURUM-NOTU 7.3),
    // reddedilenler ise kalıcı silindiği için (frontend "İhlal değil" = hard
    // delete) veritabanında zaten kalmaz.
    private Map<String, Object> reportData() {
        Instant todayStart = ZonedDateTime.now(ISTANBUL).toLocalDate().atStartOfDay(ISTANBUL).toInstant();

        Long totalDetections = jdbc.queryForObject(
                "select count(*) from violations where detected_at >= ? and review_status <> 'REJECTED'",
                Long.class, Timestamp.from(todayStart));
        Long confirmedCount = jdbc.queryForObject(
                "select count(*) from violations where detected_at >= ? and review_status = 'CONFIRMED'",
                Long.class, Timestamp.from(todayStart));

        List<Map<String, Object>> confirmed = jdbc.query(
                "select camera_id, detected_at from violations "
                        + "where detected_at >= ? and review_status = 'CONFIRMED' order by detected_at desc",
                (rs, rowNum) -> {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("cameraId", rs.getString("camera_id"));
                    row.put("detectedAt", rs.getTimestamp("detected_at").toInstant().toString());
                    return row;
                },
                Timestamp.from(todayStart));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("date", ZonedDateTime.now(ISTANBUL).toLocalDate().toString());
        body.put("totalDetections", totalDetections);
        body.put("confirmedCount", confirmedCount);
        body.put("confirmed", confirmed);
        return body;
    }

    // Kamera adları detector tarafındaki cameras.json'da tutulur, backend'in
    // haberi yok — bu yüzden istemci (zaten elindeki kamera listesinden)
    // id->ad eşlemesini gövdede gönderir. Eşleme boş/eksikse rapor id'yi yazar.
    @PostMapping("/report.pdf")
    public ResponseEntity<byte[]> reportPdf(
            @RequestBody(required = false) Map<String, Map<String, String>> body) throws IOException {
        Map<String, String> cameraNames = body != null && body.get("cameraNames") != null
                ? body.get("cameraNames") : Map.of();

        Map<String, Object> data = reportData();
        @SuppressWarnings("unchecked")
        List<Map<String, Object>> confirmed = (List<Map<String, Object>>) data.get("confirmed");

        byte[] pdf = pdfService.render(
                (String) data.get("date"),
                (Long) data.get("totalDetections"),
                (Long) data.get("confirmedCount"),
                confirmed, cameraNames);

        String filename = "rapor-" + data.get("date") + ".pdf";
        return ResponseEntity.ok()
                .contentType(MediaType.APPLICATION_PDF)
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .body(pdf);
    }
}
