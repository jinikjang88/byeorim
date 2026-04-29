# ADR 0020. Python 코드 생성 구조

- 상태: 채택
- 날짜: 2026-04-28
- 결정자: DevSmith

## 맥락

ADR 0017이 박은 7대 원칙을 Python으로 풀어낸다. architecture.yml의 language가 `python`일 때 set 단계가 어떤 구조로 코드를 생성할지를 정한다.

Python 생태계는 웹 프레임워크에서 두 갈래(완성 형태의 Django와 마이크로 형태의 Flask/FastAPI)로 나뉜다. ADR 0017의 7원칙(특히 보안과 모듈 분리)에 가장 잘 답하는 자리를 고른다.

이번 출시도 backend 우선. frontend는 별도 ADR.

## 검토한 옵션

### 결정 1. 웹 프레임워크

#### 옵션 A. FastAPI
- 장점: 모던, async-first, Pydantic 기반 입력/출력 검증 빌트인. ADR 0017 결정 1(보안 최우선)의 입력 검증을 프레임워크 기본에서 강제. OpenAPI 자동 생성. 타입 힌트 친화
- 단점: Django/Flask보다 새 자리. 설정에 따라 보안 plugin을 추가해야 할 수 있음

#### 옵션 B. Django + Django REST Framework
- 장점: 풀스택. 어드민, ORM, 인증이 한 자리에 묶임. 큰 생태계
- 단점: 무겁다. async 지원이 후발. ADR 0017 결정 2(feature 단위 분리)와 Django의 app 구조가 잘 맞지만 학습 곡선 큼

#### 옵션 C. Flask
- 장점: 가벼움. 자유도 높음
- 단점: 모든 자리(검증, 인증, ORM, OpenAPI)를 사용자가 조립. ADR 0017 결정 1 위배 위험. Express와 같은 약점

### 결정 2. 빌드 도구와 의존성 관리

#### 옵션 A. Poetry
- 장점: pyproject.toml 표준. lock 파일 빌트인. 가상 환경 관리. 모노레포 지원(workspaces 비슷한 path 의존성)
- 단점: pip보다 첫 설치 마찰. uv처럼 빠르지는 않음

#### 옵션 B. uv
- 장점: 매우 빠름. Rust 기반. Poetry와 호환
- 단점: 비교적 새 자리. 1순위 사용자가 만난 다음 사람의 환경에서 익숙하지 않을 수 있음

#### 옵션 C. pip + requirements.txt
- 장점: 가장 보편
- 단점: lock 파일 표준 부재. 의존성 트리 재현성 약함

### 결정 3. 테스트 프레임워크

#### 옵션 A. pytest
- 장점: Python 테스트 사실상 표준. fixture, parametrize, plugin 풍부
- 단점: 추가 의존성

#### 옵션 B. unittest (표준 라이브러리)
- 장점: 표준 라이브러리, 의존성 0
- 단점: 표현력 약함. fixture 약함

### 결정 4. 모듈 시스템과 디렉토리 구조

#### 옵션 A. src layout + feature 단위 패키지
- 장점: 모던 Python 권장(PEP 표준 따름). feature 분리(ADR 0017 결정 2)와 헥사고날 4영역(domain/application/infrastructure/web)을 패키지로 표현 가능
- 단점: 첫 학습 곡선

#### 옵션 B. flat layout
- 장점: 단순
- 단점: 패키지가 여러 자리에 흩어질 위험. import 경로 모호

#### 옵션 C. Django 스타일 app 구조
- 장점: Django 사용 시 자연스러움
- 단점: FastAPI 채택(결정 1)과 결이 다름

### 결정 5. 보안 기본값

#### 옵션 A. FastAPI 기본 + 표준 보안 라이브러리 묶음
- 장점: Pydantic이 입력 검증을 기본 강제. OAuth2 + JWT는 FastAPI Security 모듈로
- 단점: 일부 자리(보안 헤더, CORS)는 미들웨어 명시적 등록 필요

#### 옵션 B. 사용자가 자유 조립
- 장점: 자유도
- 단점: ADR 0017 결정 1 위배

표준 보안 묶음(옵션 A 채택 시):
- Pydantic: 입력/출력 검증 (FastAPI 빌트인)
- python-jose 또는 PyJWT: JWT 발급/검증
- passlib (argon2 또는 bcrypt): 비밀번호 해시
- fastapi.security: OAuth2 의존성 주입
- starlette.middleware.cors: CORS 설정
- secure (Python 라이브러리): 보안 헤더(CSP, HSTS 등)
- python-dotenv: .env 로드(.env는 .gitignore)
- SQLAlchemy: ORM, 파라미터화 쿼리(raw SQL 금지)

### 결정 6. 로깅

#### 옵션 A. structlog
- 장점: 구조화 로그(JSON) 빌트인. 운영 도구와 연결 쉬움. 컨텍스트 바인딩
- 단점: 표준 logging 위에서 동작하지만 학습 자료가 살짝 적음

#### 옵션 B. 표준 logging + python-json-logger
- 장점: 표준 라이브러리 기반
- 단점: 구조화 로그가 두 라이브러리 조합

### 결정 7. 백엔드/프론트엔드 분리

#### 옵션 A. 별도 디렉토리 (backend/, frontend/)
- 장점: 분리 명확
- 단점: Python 프로젝트가 모노레포 도구를 자체로 가지지 않음(npm workspaces 같은). 두 자리를 묶으려면 부모 디렉토리에 README와 스크립트로 안내

#### 옵션 B. 두 별도 저장소
- 장점: 완전 분리
- 단점: 사용자 부담

### 결정 8. 디자인 패턴 표현

#### 옵션 A. 헥사고날 + FastAPI Depends + Pydantic 스키마
- 장점: ADR 0017 결정 7을 받침. FastAPI의 `Depends()`가 의존성 주입을 명시적으로 만들고, Pydantic이 경계 검증을 강제. domain/application/infrastructure/web 4영역이 패키지로 분리됨
- 단점: 클래스 기반 DI 컨테이너(예: dependency-injector) 없이 `Depends()`만으로 처리. 큰 프로젝트에서는 한계

#### 옵션 B. dependency-injector 라이브러리
- 장점: Java/Spring 같은 명시적 DI 컨테이너
- 단점: 추가 의존성. FastAPI 관용에서 멀어짐

#### 옵션 C. 절차적 함수 모음
- 장점: 가장 단순
- 단점: ADR 0017 결정 4와 결정 7과 충돌. 의존성 방향 강제 어려움

## 결정

### 결정 1: FastAPI (옵션 A)

웹 프레임워크는 **FastAPI**. Pydantic 기반 입력/출력 검증이 프레임워크 기본에서 강제되어 ADR 0017 결정 1(보안 최우선)을 받침. async-first 설계와 OpenAPI 자동 생성이 모던 Python 백엔드의 표준.

Python 3.11+ 강제. 타입 힌트 적극 활용.

### 결정 2: Poetry (옵션 A)

빌드/의존성 도구는 **Poetry**. pyproject.toml 표준을 따르고 lock 파일이 빌트인이라 의존성 재현성 보장. 모노레포(BE/FE 분리, 결정 7)에서 path 의존성으로 자리를 묶을 수 있음.

uv가 빠르긴 하나 아직 자리가 새다. Poetry로 시작하고, uv가 표준이 되면 별도 ADR로 마이그레이션.

### 결정 3: pytest (옵션 A)

테스트는 **pytest**. fixture와 parametrize가 강력하고 plugin 생태계 풍부. unittest는 표준이지만 표현력이 약함.

각 feature 패키지에 자체 tests/ 폴더.

### 결정 4: src layout + feature 단위 패키지 + 헥사고날 (옵션 A)

디렉토리 구조는 다음 표준이다.

```
generated/
├── pyproject.toml
├── README.md
├── backend/
│   ├── pyproject.toml
│   ├── src/
│   │   └── {project_name}/
│   │       ├── __init__.py
│   │       ├── main.py            # FastAPI 엔트리, 미들웨어 등록
│   │       ├── config.py          # 환경 변수 로드(pydantic-settings)
│   │       ├── shared/            # feature 간 공유(최소화)
│   │       └── features/
│   │           └── {feature_name}/
│   │               ├── __init__.py
│   │               ├── domain.py        # 엔티티, 값 객체 (Pydantic 또는 dataclass)
│   │               ├── application.py   # use case 함수
│   │               ├── infrastructure.py # repository 구현
│   │               ├── routes.py        # FastAPI 라우터
│   │               └── schemas.py       # 입력/출력 Pydantic 모델
│   └── tests/
│       └── features/
│           └── {feature_name}/
│               └── test_{operation}.py
└── frontend/                       # 이번 출시는 placeholder
    └── README.md
```

src layout으로 패키지 import 충돌 방지. feature 단위 패키지가 ADR 0017 결정 2(MSA 준비)를 받침. 각 feature 안에 헥사고날 4영역을 파일 단위로 표현(Java 패키지 단위와 다르게, Python은 모듈/파일 단위가 자연스러움).

의존성 방향은 ADR 0017 결정 4를 따른다.
- domain.py는 다른 영역을 import 안 함
- application.py는 domain만 import
- infrastructure.py는 domain/application만 import
- routes.py는 application/schemas만 import
- feature 간 직접 import 금지(shared/를 통해서만)

`import-linter` 라이브러리로 import 그래프 자동 검증.

### 결정 5: FastAPI 기본 + 표준 보안 라이브러리 (옵션 A)

표준 보안 묶음.

| 영역             | 도구                         | 역할                                  |
| ---------------- | ---------------------------- | ------------------------------------- |
| 입력 검증        | Pydantic (FastAPI 빌트인)    | 모든 요청 본문/파라미터 자동 검증     |
| 인증             | python-jose (JWT)            | 무상태 토큰                           |
| 인가             | FastAPI Depends + dependency | 의존성 주입으로 권한 가드             |
| 비밀번호         | passlib (argon2)             | 안전한 해시                           |
| SQL injection 방어 | SQLAlchemy ORM             | 파라미터화 쿼리, raw SQL 금지         |
| 보안 헤더        | secure 라이브러리            | CSP, HSTS, X-Frame-Options 등         |
| CORS             | starlette CORSMiddleware     | origin 화이트리스트                   |
| 시크릿           | python-dotenv + pydantic-settings | .env에서 검증된 설정 로드        |

기본 정책: 라우트는 명시적 dependency로 인증 표시. 공개 엔드포인트는 dependency 없음으로 명시.

### 결정 6: structlog (옵션 A)

로깅은 **structlog**. JSON 구조화 로그가 빌트인이고 컨텍스트 바인딩(요청 ID, 사용자 ID 등)이 깨끗.

민감정보 마스킹: structlog의 processor 체인에 마스킹 processor 추가. password, token, ssn 같은 키 자동 마스킹.

### 결정 7: 별도 디렉토리 (backend/, frontend/) (옵션 A)

generated/ 안에 두 디렉토리가 있고 각자 자체 빌드 도구를 가짐. 부모 디렉토리에는 README와 안내 스크립트. Python 프로젝트가 npm workspaces 같은 단일 도구를 가지지 않으므로 안내가 명시적이어야 함.

이번 출시는 backend만. frontend/는 placeholder.

### 결정 8: 헥사고날 + FastAPI Depends + Pydantic (옵션 A)

디자인 패턴 표준.

- **FastAPI Depends**: 의존성 주입의 표준 자리. repository, service가 라우트에 주입됨
- **Pydantic 모델**: 입력/출력 경계의 검증. domain 객체와 분리(domain은 dataclass 또는 일반 클래스)
- **Repository 인터페이스**: Python에는 인터페이스 키워드가 없으므로 Protocol 또는 ABC 사용
- **service는 use case 단위 함수**: `place_order(command)`, `cancel_order(order_id)`
- **순수 domain**: domain.py는 I/O 없음. dataclass + 도메인 메서드

예: features/order/

```python
# domain.py
from dataclasses import dataclass
from typing import Protocol
from uuid import UUID

@dataclass(frozen=True)
class Order:
    id: UUID
    items: list[OrderItem]
    # ...

class OrderRepository(Protocol):
    def find_by_id(self, order_id: UUID) -> Order | None: ...
    def save(self, order: Order) -> None: ...

# schemas.py
from pydantic import BaseModel

class PlaceOrderRequest(BaseModel):
    items: list[OrderItemInput]
    # ...

class OrderResponse(BaseModel):
    id: UUID
    # ...

# application.py
from .domain import Order, OrderRepository

def place_order(command: PlaceOrderRequest, repository: OrderRepository) -> Order:
    # 도메인 로직
    order = Order(...)
    repository.save(order)
    return order

# infrastructure.py
from sqlalchemy.orm import Session
from .domain import Order, OrderRepository

class SqlOrderRepository:
    def __init__(self, session: Session):
        self._session = session

    def find_by_id(self, order_id: UUID) -> Order | None:
        # ORM 쿼리
        ...

    def save(self, order: Order) -> None:
        # ORM 저장
        ...

# routes.py
from fastapi import APIRouter, Depends
from .schemas import PlaceOrderRequest, OrderResponse
from .application import place_order
from .infrastructure import SqlOrderRepository
from ..shared.deps import get_db_session

router = APIRouter(prefix="/orders")

def get_order_repository(session=Depends(get_db_session)) -> SqlOrderRepository:
    return SqlOrderRepository(session)

@router.post("/", response_model=OrderResponse)
def create_order(
    request: PlaceOrderRequest,
    repository: SqlOrderRepository = Depends(get_order_repository),
):
    order = place_order(request, repository)
    return OrderResponse(id=order.id)
```

### 코드 컨벤션

- Black + isort로 자동 포맷
- ruff로 정적 검사 (PEP 8, 더 엄격한 규칙)
- mypy로 타입 검사 (strict 모드)
- 함수는 30줄 이하 권장(린트 경고)

## 결과

### 긍정적
- FastAPI + Pydantic 조합이 ADR 0017 결정 1을 강하게 받침. 입력/출력 검증이 프레임워크 기본에서 강제됨
- src layout + feature 패키지가 ADR 0017 결정 2를 자연스럽게 만든다. 한 패키지가 한 마이크로서비스로 분리됨
- 헥사고날 4영역을 파일 단위로 표현하는 자리가 Python 관용에 충실(Java처럼 패키지 단위로 가르지 않음)
- import-linter가 의존성 방향을 자동 검증. ADR 0017 결정 4를 코드 차원에서 강제
- mypy strict 모드가 인터페이스(Protocol) 위반을 컴파일 타임처럼 잡음
- structlog의 processor 체인이 민감정보 마스킹을 형식 차원에서 강제

### 부정적 / 트레이드오프
- Python의 인터페이스 표현(Protocol/ABC)이 Java 인터페이스보다 약함. 런타임에만 검증되는 자리도 있음. 다만 mypy strict로 상당 부분 보강
- src layout이 일부 사용자에게 낯섦. 다만 모던 Python 권장이라 시간이 지나며 익숙해짐
- Python의 모노레포 도구가 빈약함. backend/와 frontend/를 묶는 자리는 README와 스크립트로 안내해야 함
- frontend가 비어있음. 미래 ADR로 채울 자리

### 미래 묶임
- 본 ADR의 8개 결정 모두 표준이다. 변경하려면 ADR 필요
- Python 메이저 버전 업그레이드는 별도 ADR
- uv로 마이그레이션은 별도 ADR(우리 표준이 충분히 자랄 때)
- frontend 자동 생성은 별도 ADR
- 다른 Python 프레임워크(Django 등)로 옮기려면 별도 ADR

## 링크
- 이전 결정: ADR 0017 (생성 코드 7대 원칙)
- 짝 결정: ADR 0018 (Node), ADR 0019 (Java)
- 후속 작업 후보: frontend 자동 생성 ADR, set 단계의 Python 코드 생성 구현(별도 PR), uv 마이그레이션 ADR
- 관련 정책: CLAUDE.md 섹션 3(의존성 방향 정신을 생성 코드에도 적용)
