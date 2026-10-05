# Build context MUST be sunucu/ (parent of backend/ and frontend/) because
# vite.config.js writes its build output straight into
# backend/src/main/resources/static (outDir: ../backend/src/main/resources/static).
#
#   docker build -f backend/Dockerfile -t themrgndzd/ppe-backend:latest sunucu/
#
# Secret-free image: no config/cameras/.env baked in — safe to push to a
# PUBLIC Docker Hub repo. Runtime secrets (PG_*, BACKEND_API_KEY) come from
# the server's .env via docker-compose env_file.

# ---- 1) frontend build (vite -> backend/src/main/resources/static) --------
FROM node:20-alpine AS frontend-build
WORKDIR /src/frontend
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
# needs the sibling backend/src tree to exist so outDir resolves
COPY backend/src ../backend/src
RUN npm run build

# ---- 2) maven build (jar bundles the static assets from stage 1) ----------
FROM maven:3.9-eclipse-temurin-21 AS backend-build
WORKDIR /src/backend
COPY backend/pom.xml ./
RUN mvn -B -q dependency:go-offline
COPY backend/src ./src
RUN rm -rf ./src/main/resources/static/*
COPY --from=frontend-build /src/backend/src/main/resources/static ./src/main/resources/static
RUN mvn -B -q -DskipTests package

# ---- 3) runtime -------------------------------------------------------------
FROM eclipse-temurin:21-jre-jammy AS runtime
WORKDIR /app
COPY --from=backend-build /src/backend/target/ppe-0.0.1-SNAPSHOT.jar app.jar
EXPOSE 8080
# `-XX:MaxRAMPercentage=70.0`: JDK 10+ container ergonomisi varsayılan olarak
# heap tavanını container bellek limitinin yalnız %25'i yapar — 2 GiB'lik bir
# container limitinde (bkz. docker-compose.yml deploy.resources.limits.memory)
# bu yalnız 512 MiB heap demektir; multipart görsel upload + Hibernate için
# dar. %70'e çekilince ~1.4 GiB heap kalır, geri kalanı metaspace/thread
# stack/native tamponlar için yeterli pay bırakır.
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=70.0", "-jar", "app.jar"]
