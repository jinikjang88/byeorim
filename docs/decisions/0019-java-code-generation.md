# ADR 0019. Java 코드 생성 구조

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0017이 박은 7대 원칙을 Java로 풀어낸다. architecture.yml의 language가 `java`일 때 set 단계가 어떤 구조로 코드를 생성할지를 정한다.

Java 생태계는 엔터프라이즈에서 두텁다. Spring Boot가 사실상 표준이고, 보안과 모듈 구조에 대한 도구가 풍부하다. ADR 0017의 7원칙(특히 보안과 단방향 의존성, 디자인 패턴)을 실천하기에 자연스러운 자리다.

이번 출시도 backend 우선. frontend는 별도 ADR.

## 검토한 옵션

### 결정 1. 웹 프레임워크

#### 옵션 A. Spring Boot
- 장점: Java 웹 표준. 거대한 생태계. Spring Security, Spring Data, Spring Validation 등 ADR 0017 7원칙을 모두 받쳐주는 도구가 갖춰져 있음. 1순위 사용자가 만들어낸 코드를 다른 Java 개발자에게 넘기기 쉬움
- 단점: 무겁다. 첫 빌드와 시작이 느림. 학습 곡선 큼

#### 옵션 B. Quarkus
- 장점: 빠른 시작, native image 지원, 모던
- 단점: Spring보다 작은 커뮤니티. 1순위 사용자 환경에서 자료가 적음

#### 옵션 C. Micronaut
- 장점: 컴파일 타임 DI, 빠름
- 단점: 비교적 새 자리

### 결정 2. 빌드 도구

#### 옵션 A. Gradle Kotlin DSL
- 장점: 빌드 스크립트가 타입 안전. Kotlin 자동 완성과 IDE 지원. 멀티모듈 프로젝트에 강력. Maven보다 빠름
- 단점: Groovy DSL과 다른 문법. Maven보다 자료 적음

#### 옵션 B. Maven
- 장점: 가장 보편. XML이라 도구 친화
- 단점: XML이라 표현력 약함. 빌드 시간 길음

#### 옵션 C. Gradle Groovy DSL
- 장점: Gradle의 익숙한 모습
- 단점: Kotlin DSL이 표준이 되어가는 흐름이라 미래 부담

### 결정 3. 테스트 프레임워크

#### 옵션 A. JUnit 5 + AssertJ + Mockito
- 장점: Java 테스트 표준 묶음. JUnit 5는 모던. AssertJ는 가독성 좋은 매처. Mockito는 mock 표준
- 단점: 세 라이브러리를 함께 다뤄야 함

#### 옵션 B. Spock (Groovy)
- 장점: 표현력 풍부. Given-When-Then 자연스러움
- 단점: Groovy 의존. Java 프로젝트에 다른 언어 끼우는 부담

### 결정 4. 모듈 시스템과 디렉토리 구조

#### 옵션 A. Gradle 멀티모듈 + feature 단위 모듈 + 헥사고날 아키텍처
- 장점: ADR 0017 결정 2(MSA 준비, feature 분리)를 가장 강하게 실천. 각 feature가 자체 Gradle 모듈이고 미래 마이크로서비스 분리 시 모듈이 그대로 빠짐. 헥사고날(domain/application/infrastructure/web)이 ADR 0017 결정 4(단방향 의존성)와 결정 7(디자인 패턴)을 받침
- 단점: 첫 학습 곡선 큼. 작은 프로젝트에 무거워 보일 수 있음

#### 옵션 B. 단일 모듈 + 패키지 단위 분리
- 장점: 단순
- 단점: 미래 MSA 분리 시 패키지를 모듈로 다시 갈라야 함. 의존성 방향 강제도 모듈 경계가 없으면 약함

#### 옵션 C. 레이어 단위 모듈 (web/, service/, repository/)
- 장점: 익숙
- 단점: 같은 feature가 세 모듈에 흩어짐. ADR 0017 결정 2와 충돌

### 결정 5. 보안 기본값

#### 옵션 A. Spring Security + JWT + Bean Validation
- 장점: Spring 생태계 표준. 모든 엔드포인트가 기본 차단(allow-list 방식). ADR 0017 결정 1과 일치
- 단점: 설정이 살짝 복잡. 학습 비용 있음

#### 옵션 B. 자체 필터 체인
- 장점: 가벼움
- 단점: 보안을 직접 짜는 일은 위험. ADR 0017 결정 1 위배

표준 보안 묶음(옵션 A 채택 시):
- Spring Security: 인증/인가
- JWT: 무상태 토큰
- Bean Validation (`@Valid`, `@NotBlank` 등): 입력 검증
- BCrypt: 비밀번호 해시
- Spring Boot Actuator + 시크릿 분리: 운영 정보와 시크릿 자리 구분
- 시크릿: 환경 변수 또는 Spring Cloud Config

### 결정 6. 로깅

#### 옵션 A. SLF4J + Logback
- 장점: Java 표준. Spring Boot 기본 포함. 구조화 로그(JSON encoder)로 운영 도구와 연결 쉬움
- 단점: 설정 파일(logback-spring.xml)이 익숙해지기까지 시간

#### 옵션 B. Log4j2
- 장점: 비동기 로깅 빠름
- 단점: Log4Shell 같은 보안 사고 이력. ADR 0017 결정 1 정신상 살짝 보수적

### 결정 7. 백엔드/프론트엔드 분리

#### 옵션 A. Gradle 멀티모듈 안에 frontend는 별도 모듈 또는 별도 디렉토리
- 장점: 한 빌드에서 두 자리 묶음. settings.gradle.kts에서 `include(":backend", ":frontend")`
- 단점: frontend가 Java가 아닐 가능성 높음(JS/TS). Gradle이 외부 빌드 도구 호출해야 함

#### 옵션 B. 두 별도 저장소
- 장점: 완전 분리
- 단점: 사용자가 두 저장소 관리

### 결정 8. 디자인 패턴 표현

#### 옵션 A. 헥사고날 아키텍처 + 생성자 주입 + 인터페이스 우선
- 장점: ADR 0017 결정 4와 결정 7을 가장 충실히 실천. 도메인이 인프라/웹을 모르고, 의존성 방향이 명확. Spring DI를 생성자 주입으로만 사용(필드 주입 금지)
- 단점: 보일러플레이트 살짝 많음. 인터페이스 + 구현 클래스 두 자리

#### 옵션 B. 레이어드 아키텍처 (Controller-Service-Repository)
- 장점: 익숙
- 단점: 인프라가 도메인을 침범하기 쉬움(JPA 엔티티가 도메인 객체로 흘러감 등). ADR 0017 결정 4의 단방향이 새기 쉬움

## 결정

### 결정 1: Spring Boot (옵션 A)

웹 프레임워크는 **Spring Boot**. Java 표준이고 ADR 0017 7원칙을 받쳐주는 도구가 갖춰져 있음. Spring Security, Bean Validation, Spring Data가 한 자리에 모인다.

Spring Boot 버전은 LTS 흐름을 따름(현재 3.x). Java 17+ 강제.

### 결정 2: Gradle Kotlin DSL (옵션 A)

빌드 도구는 **Gradle Kotlin DSL**. 멀티모듈에 강하고(결정 4와 짝) 빌드 스크립트가 타입 안전. Maven보다 빠르고 Groovy DSL보다 모던.

settings.gradle.kts에서 `include(":app", ":modules:order", ":modules:payment", ...)` 식으로 모듈을 등록한다.

### 결정 3: JUnit 5 + AssertJ + Mockito (옵션 A)

테스트는 표준 묶음. **JUnit 5** 본체, **AssertJ** 매처, **Mockito** mock. Spring Boot Test가 세 라이브러리를 묶어 제공.

각 feature 모듈에 자체 test/ 폴더. 단위 테스트는 Spring 컨텍스트 없이, 통합 테스트는 `@SpringBootTest`.

### 결정 4: Gradle 멀티모듈 + feature 모듈 + 헥사고날 (옵션 A)

디렉토리 구조는 다음 표준이다.

```
generated/
├── backend/                     # ADR 0017 결정 6의 backend wrapper
│   ├── settings.gradle.kts
│   ├── build.gradle.kts         # 공통 설정 (Java 버전, 공통 의존성)
│   ├── app/                     # 엔트리, 부트스트랩
│   │   ├── build.gradle.kts
│   │   └── src/main/java/com/{org}/{project}/Application.java
│   └── modules/
│       └── {feature-name}/
│           ├── build.gradle.kts
│           └── src/main/java/com/{org}/{project}/{feature}/
│               ├── domain/          # 엔티티, 값 객체, 도메인 서비스 (순수 Java)
│               ├── application/     # use case (도메인을 엮는 service)
│               ├── infrastructure/  # repository 구현, 외부 API 클라이언트
│               └── web/             # 컨트롤러, 요청/응답 DTO, 검증 스키마
└── frontend/                    # 별도 디렉토리(이번 출시는 placeholder)
    └── README.md
```

> 갱신 (2026-04-28, ADR 0019 작성 직후 발견): 초안에서 backend/ wrapper가 빠진 자리를 ADR 0017 결정 6과 ADR 0018의 패턴에 맞춰 일관되게 갱신. Java도 generated/backend/ 아래에 자리잡는다. ADR 본문의 다른 결정은 변경 없음.

각 feature 모듈이 헥사고날 4영역(domain/application/infrastructure/web)을 가진다. 의존성 방향:

```
domain ← application ← infrastructure
domain ← application ← web
```

domain은 다른 영역을 모름. application은 domain만 안다. infrastructure와 web은 application과 domain을 알지만 서로는 모름.

ADR 0017 결정 4의 단방향 의존성은 다음 도구로 강제한다.
- ArchUnit 테스트(자동화된 의존성 그래프 검증)
- Gradle 모듈의 dependencies 블록(모듈 간 의존성 명시)

### 결정 5: Spring Security + JWT + Bean Validation (옵션 A)

표준 보안 묶음.

| 영역             | 도구                              | 역할                                  |
| ---------------- | --------------------------------- | ------------------------------------- |
| 인증             | Spring Security + JWT             | 무상태 토큰 기반 인증                 |
| 인가             | Spring Security `@PreAuthorize`   | 메서드 단위 권한                      |
| 입력 검증        | Bean Validation (`@Valid`)        | DTO 필드 검증                         |
| SQL injection 방어 | Spring Data JPA(파라미터 바인딩) | raw SQL 금지                          |
| 비밀번호         | BCrypt                            | 안전한 해시                           |
| 보안 헤더        | Spring Security 기본              | CSP, HSTS, X-Frame-Options            |
| CORS             | Spring Security 명시 설정         | origin 화이트리스트                   |
| 시크릿           | 환경 변수 + Spring profile        | application.yml에 하드코딩 금지       |
| 의존성 취약점    | Gradle Versions Plugin            | 알려진 CVE 모니터링                   |

기본 정책: 모든 엔드포인트는 기본 차단. 공개 엔드포인트만 명시적으로 허용(`permitAll()`).

### 결정 6: SLF4J + Logback (옵션 A)

로깅은 **SLF4J + Logback**. Spring Boot 기본 포함. 운영 환경은 Logback의 JSON encoder로 구조화 로그 출력.

민감정보 마스킹: Logback의 pattern layout에 마스킹 변환기 적용(또는 logging.pattern.level 커스터마이즈). password, token 같은 키 자동 마스킹.

### 결정 7: Gradle 멀티모듈 안에 frontend 별도 디렉토리 (옵션 A)

이번 출시는 backend만. frontend/ 자리는 placeholder로 비워둠.

미래에 frontend 자동 생성 ADR이 들어오면 그 자리에 별도 빌드(예: Vite + Gradle node-plugin)를 추가.

### 결정 8: 헥사고날 + 생성자 주입 + 인터페이스 우선 (옵션 A)

디자인 패턴 표준.

- **생성자 주입만**: `@Autowired` 필드 주입 금지. Lombok `@RequiredArgsConstructor` 또는 명시적 생성자
- **인터페이스 우선**: repository는 인터페이스로 정의. 구현은 infrastructure 영역. domain/application은 인터페이스만 의존
- **DTO와 도메인 분리**: web 영역의 DTO와 domain 영역의 엔티티를 분리. 매핑은 web 또는 application 영역에서
- **Bean Validation**: 입력 DTO에 `@NotBlank`, `@Email` 등으로 경계 검증
- **service 한 가지 일**: `placeOrder`, `cancelOrder` 같은 use case 단위 메서드

예: modules/order/src/main/java/.../order/

```java
// domain/Order.java (순수 Java, Spring 없음)
public class Order {
  private final UUID id;
  private final List<OrderItem> items;
  // ...
}

// domain/OrderRepository.java (인터페이스)
public interface OrderRepository {
  Optional<Order> findById(UUID id);
  void save(Order order);
}

// application/PlaceOrderService.java
@Service
@RequiredArgsConstructor
public class PlaceOrderService {
  private final OrderRepository orderRepository;
  private final PaymentClient paymentClient;

  public OrderId place(PlaceOrderCommand command) {
    // 도메인 로직
  }
}

// infrastructure/JpaOrderRepository.java
@Repository
@RequiredArgsConstructor
public class JpaOrderRepository implements OrderRepository {
  private final OrderJpaRepository jpaRepository;
  // ...
}

// web/OrderController.java
@RestController
@RequestMapping("/orders")
@RequiredArgsConstructor
public class OrderController {
  private final PlaceOrderService placeOrderService;

  @PostMapping
  public ResponseEntity<OrderResponse> place(@Valid @RequestBody PlaceOrderRequest request) {
    // ...
  }
}
```

### 코드 컨벤션

- Google Java Style 또는 Spring Boot 컨벤션
- Spotless plugin으로 자동 포맷
- Checkstyle로 정적 검사
- 함수는 30줄 이하 권장(린트 경고)

## 결과

### 긍정적
- Spring Boot의 Spring Security가 ADR 0017 결정 1을 표준으로 묶음. 모든 엔드포인트가 기본 차단되고 명시적 허용만 통과
- Gradle 멀티모듈이 ADR 0017 결정 2(MSA 준비)를 가장 강하게 실천. 한 모듈이 한 마이크로서비스로 분리됨
- 헥사고날 아키텍처가 ADR 0017 결정 4(단방향 의존성)와 결정 7(디자인 패턴)을 함께 받침
- ArchUnit이 모듈 간 의존성 방향을 자동 검증. 사람의 규율에 의존하지 않음(CLAUDE.md 섹션 3과 같은 정신)
- Bean Validation의 `@Valid`가 모든 컨트롤러 메서드의 입력 경계에서 검증을 강제

### 부정적 / 트레이드오프
- Spring Boot의 첫 시작이 느림. 1순위 사용자가 처음 실행할 때 인내가 필요. 다만 그 비용은 보안과 모듈 분리의 가치로 갚음
- Gradle 멀티모듈이 작은 프로젝트에 무거워 보임. 다만 MSA 준비(ADR 0017 결정 2)가 우선
- 헥사고날의 인터페이스 + 구현 분리가 보일러플레이트로 보일 수 있음. 다만 이 보일러플레이트가 의존성 방향을 받침
- frontend가 비어있음. 미래 ADR로 채울 자리

### 미래 묶임
- 본 ADR의 8개 결정 모두 표준이다. 변경하려면 ADR 필요
- Spring Boot 메이저 버전 업그레이드(3.x → 4.x 등)는 별도 마이그레이션 ADR
- 보안 도구 추가/제거(예: OAuth2 도입)는 별도 ADR
- frontend 자동 생성은 별도 ADR
- 다른 Java 프레임워크(Quarkus, Micronaut)로 옮기려면 별도 ADR. 마이그레이션 부담 큰 결정

## 링크
- 이전 결정: ADR 0017 (생성 코드 7대 원칙)
- 짝 결정: ADR 0018 (Node), ADR 0020 (Python)
- 후속 작업 후보: frontend 자동 생성 ADR, set 단계의 Java 코드 생성 구현(별도 PR), Spring Boot 마이너 업그레이드 정책 ADR
- 관련 정책: CLAUDE.md 섹션 3(의존성 방향 정신을 생성 코드에도 적용)
