import type { CatalogItem } from "./types.ts";

function springProperty(key: string, defaultValue: string): CatalogItem {
  return {
    label: key,
    insertText: `${key}=\${1:${defaultValue}}`,
    documentation: "Spring Boot application configuration.",
    framework: "spring",
    kind: "Property",
  };
}

export const configCatalog: CatalogItem[] = [
  springProperty("server.port", "8080"),
  springProperty(
    "spring.datasource.url",
    "jdbc:postgresql://localhost:5432/app",
  ),
  springProperty("spring.datasource.username", "app"),
  springProperty("spring.datasource.password", "change-me"),
  springProperty(
    "spring.datasource.driver-class-name",
    "org.postgresql.Driver",
  ),
  springProperty("spring.jpa.hibernate.ddl-auto", "validate"),
  springProperty("spring.jpa.show-sql", "false"),
  springProperty("spring.jpa.open-in-view", "false"),
  springProperty("spring.jpa.properties.hibernate.format_sql", "true"),
];
