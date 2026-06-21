# AeroTrade React Frontend

기존 HTML 프로토타입을 기준으로 React/Vite 구조를 추가한 프론트엔드입니다.

## 실행

Node.js 설치 후 `frontend` 폴더에서 실행합니다.

```bash
npm install
npm run dev
```

기본 개발 서버는 `http://localhost:5173`에서 열립니다.

## 구조

- `index.html`: React 앱 진입 HTML
- `src/main.jsx`: React 렌더링 진입점
- `src/App.jsx`: 공통 레이아웃, 탭 화면, 상태 관리
- `src/theme.css`: 기존 다크/화이트 테마 색상 재사용
- `src/styles.css`: React 앱 공통 보조 스타일

기존 `dashboard.html`, `market.html`, `strategy.html`, `record.html`, `setting.html`, `login.html`은 디자인 기준안으로 남겨두었습니다.
