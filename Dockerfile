FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
RUN mvn -B -ntp package -DskipTests

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN groupadd --system chat && useradd --system --gid chat chat
COPY --from=build /app/target/chat-backend-0.0.1-SNAPSHOT.jar app.jar
USER chat
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]
