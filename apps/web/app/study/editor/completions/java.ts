import { calledName } from "./catalog-helpers.ts";
import type { CatalogItem, Framework } from "./types.ts";

function springAnnotation(
  framework: Framework,
  importPath: string,
  insertText?: string,
): CatalogItem {
  const label = importPath.slice(importPath.lastIndexOf(".") + 1);

  return {
    label,
    insertText: insertText ?? label,
    documentation: "Spring Boot 3 / Jakarta annotation.",
    framework,
    context: "annotation",
    imports: [importPath],
    kind: "Property",
  };
}

function responseBuilder(insertText: string): CatalogItem {
  const label = calledName(insertText);

  return {
    label,
    insertText,
    documentation: "ResponseEntity response builder.",
    framework: "spring-web",
    context: "member",
    receiver: "ResponseEntity",
    kind: "Method",
  };
}

export const javaCatalog: CatalogItem[] = [
  springAnnotation(
    "spring",
    "org.springframework.boot.autoconfigure.SpringBootApplication",
  ),
  springAnnotation("spring", "org.springframework.stereotype.Service"),
  springAnnotation("spring", "org.springframework.stereotype.Component"),
  springAnnotation("spring", "org.springframework.stereotype.Repository"),
  springAnnotation("spring", "org.springframework.stereotype.Controller"),
  springAnnotation(
    "spring",
    "org.springframework.context.annotation.Configuration",
  ),
  springAnnotation("spring", "org.springframework.context.annotation.Bean"),
  springAnnotation(
    "spring",
    "org.springframework.beans.factory.annotation.Value",
    'Value("\\${${1:property.name}}")',
  ),
  springAnnotation(
    "spring",
    "org.springframework.boot.context.properties.ConfigurationProperties",
    'ConfigurationProperties(prefix = "${1:app}")',
  ),
  springAnnotation(
    "spring",
    "org.springframework.transaction.annotation.Transactional",
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.RestController",
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.RequestMapping",
    'RequestMapping("${1:/api}")',
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.GetMapping",
    'GetMapping("${1:/}")',
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.PostMapping",
    'PostMapping("${1:/}")',
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.PutMapping",
    'PutMapping("${1:/{id\\}}")',
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.PatchMapping",
    'PatchMapping("${1:/{id\\}}")',
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.DeleteMapping",
    'DeleteMapping("${1:/{id\\}}")',
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.PathVariable",
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.RequestParam",
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.RequestBody",
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.ResponseStatus",
    "ResponseStatus(${1:org.springframework.http.HttpStatus.CREATED})",
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.ControllerAdvice",
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.RestControllerAdvice",
  ),
  springAnnotation(
    "spring-web",
    "org.springframework.web.bind.annotation.ExceptionHandler",
    "ExceptionHandler(${1:IllegalArgumentException}.class)",
  ),
  springAnnotation("spring-validation", "jakarta.validation.Valid"),
  springAnnotation(
    "spring-validation",
    "org.springframework.validation.annotation.Validated",
  ),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.NotNull",
  ),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.NotBlank",
  ),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.NotEmpty",
  ),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.Size",
    "Size(min = ${1:1}, max = ${2:100})",
  ),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.Min",
    "Min(${1:1})",
  ),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.Max",
    "Max(${1:100})",
  ),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.Positive",
  ),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.PositiveOrZero",
  ),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.Negative",
  ),
  springAnnotation("spring-validation", "jakarta.validation.constraints.Email"),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.Pattern",
    'Pattern(regexp = "${1:.*}")',
  ),
  springAnnotation("spring-validation", "jakarta.validation.constraints.Past"),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.Future",
  ),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.DecimalMin",
    'DecimalMin("${1:0.0}")',
  ),
  springAnnotation(
    "spring-validation",
    "jakarta.validation.constraints.DecimalMax",
    'DecimalMax("${1:100.0}")',
  ),
  springAnnotation("spring-jpa", "jakarta.persistence.Entity"),
  springAnnotation(
    "spring-jpa",
    "jakarta.persistence.Table",
    'Table(name = "${1:items}")',
  ),
  springAnnotation("spring-jpa", "jakarta.persistence.Id"),
  springAnnotation("spring-jpa", "jakarta.persistence.GeneratedValue"),
  springAnnotation(
    "spring-jpa",
    "jakarta.persistence.Column",
    "Column(nullable = false)",
  ),
  springAnnotation("spring-jpa", "jakarta.persistence.ManyToOne"),
  springAnnotation("spring-jpa", "jakarta.persistence.OneToMany"),
  springAnnotation(
    "spring-jpa",
    "jakarta.persistence.JoinColumn",
    'JoinColumn(name = "${1:parent_id}")',
  ),
  springAnnotation(
    "spring-security",
    "org.springframework.security.config.annotation.web.configuration.EnableWebSecurity",
  ),
  springAnnotation(
    "spring-security",
    "org.springframework.security.access.prepost.PreAuthorize",
    "PreAuthorize(\"${1:hasRole('ADMIN')}\")",
  ),
  springAnnotation(
    "spring-test",
    "org.springframework.boot.test.context.SpringBootTest",
  ),
  springAnnotation(
    "spring-test",
    "org.springframework.boot.test.autoconfigure.web.servlet.WebMvcTest",
  ),
  springAnnotation(
    "spring-test",
    "org.springframework.boot.test.autoconfigure.orm.jpa.DataJpaTest",
  ),
  springAnnotation(
    "spring-test",
    "org.springframework.test.context.bean.override.mockito.MockitoBean",
  ),
  springAnnotation("spring-test", "org.junit.jupiter.api.Test"),
  {
    label: "spring-rest-controller",
    insertText: `@RestController
@RequestMapping("\${1:/api/items}")
public class \${2:ItemController} {
    @GetMapping
    public ResponseEntity<String> list() {
        return ResponseEntity.ok("\${3:Hello}");
    }
}`,
    documentation: "REST controller with a GET endpoint.",
    framework: "spring-web",
    imports: [
      "org.springframework.web.bind.annotation.RestController",
      "org.springframework.web.bind.annotation.RequestMapping",
      "org.springframework.web.bind.annotation.GetMapping",
      "org.springframework.http.ResponseEntity",
    ],
  },
  {
    label: "spring-service",
    insertText: `@Service
public class \${1:ItemService} {
    private final \${2:ItemRepository} repository;

    public \${1:ItemService}(\${2:ItemRepository} repository) {
        this.repository = repository;
    }
}`,
    documentation: "Service with constructor injection.",
    framework: "spring",
    imports: ["org.springframework.stereotype.Service"],
  },
  {
    label: "jpa-entity",
    insertText: `@Entity
public class \${1:Item} {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String \${2:name};

    protected \${1:Item}() {
    }
}`,
    documentation:
      "JPA entity with a generated identifier and no-argument constructor.",
    framework: "spring-jpa",
    imports: [
      "jakarta.persistence.Entity",
      "jakarta.persistence.Id",
      "jakarta.persistence.GeneratedValue",
      "jakarta.persistence.GenerationType",
      "jakarta.persistence.Column",
    ],
  },
  {
    label: "spring-data-repository",
    insertText: `public interface \${1:ItemRepository} extends JpaRepository<\${2:Item}, \${3:Long}> {
    $0
}`,
    documentation: "Spring Data JPA repository.",
    framework: "spring-jpa",
    imports: ["org.springframework.data.jpa.repository.JpaRepository"],
  },
  {
    label: "validated-record-dto",
    insertText: `public record \${1:CreateItemRequest}(
    @NotBlank String \${2:name},
    @Positive int \${3:quantity}
) {
}`,
    documentation: "Record request DTO with Jakarta validation.",
    framework: "spring-validation",
    imports: [
      "jakarta.validation.constraints.NotBlank",
      "jakarta.validation.constraints.Positive",
    ],
  },
  {
    label: "global-exception-handler",
    insertText: `@RestControllerAdvice
public class \${1:GlobalExceptionHandler} {
    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<String> handle(IllegalArgumentException exception) {
        return ResponseEntity.badRequest().body(exception.getMessage());
    }
}`,
    documentation: "Global REST exception handler.",
    framework: "spring-web",
    imports: [
      "org.springframework.web.bind.annotation.RestControllerAdvice",
      "org.springframework.web.bind.annotation.ExceptionHandler",
      "org.springframework.http.ResponseEntity",
    ],
  },
  {
    label: "response-ok",
    insertText: "ResponseEntity.ok(${1:body})",
    documentation: "Return a successful response.",
    framework: "spring-web",
    imports: ["org.springframework.http.ResponseEntity"],
  },
  {
    label: "response-created",
    insertText: "ResponseEntity.created(${1:location}).body(${2:body})",
    documentation: "Return 201 with a Location URI.",
    framework: "spring-web",
    imports: ["org.springframework.http.ResponseEntity"],
  },
  {
    label: "response-no-content",
    insertText: "ResponseEntity.noContent().build()",
    documentation: "Return an empty 204 response.",
    framework: "spring-web",
    imports: ["org.springframework.http.ResponseEntity"],
  },
  {
    label: "main",
    insertText: `public static void main(String[] args) {
    $0
}`,
    documentation: "Java application entry point.",
  },
  {
    label: "record",
    insertText: `public record \${1:Item}(\${2:String name}) {
}`,
    documentation: "Immutable Java record.",
  },
  {
    label: "try-with-resources",
    insertText: `try (\${1:var resource = openResource()}) {
    $0
}`,
    documentation: "Close an AutoCloseable resource automatically.",
  },
  {
    label: "stream-pipeline",
    insertText: `\${1:items}.stream()
    .filter(\${2:item -> true})
    .map(\${3:item -> item})
    .toList()`,
    documentation: "Filter and map a Java Stream.",
  },
  {
    label: "optional",
    insertText: `Optional.ofNullable(\${1:value})
    .map(\${2:item -> item})
    .orElse(\${3:fallback})`,
    documentation: "Transform an optional value.",
    imports: ["java.util.Optional"],
  },
  responseBuilder("ok(${1:body})"),
  responseBuilder("status(${1:201}).body(${2:body})"),
  responseBuilder("created(${1:location}).body(${2:body})"),
  responseBuilder("noContent().build()"),
  responseBuilder("badRequest().body(${1:body})"),
  responseBuilder("notFound().build()"),
];
