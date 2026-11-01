# Onestop Signal Server

원스탑 경영지원센터 — 실시간 화면 상담 시그널링 서버

## 역할
- WebSocket 기반 SDP/ICE 중계만 담당 (실제 미디어는 P2P)
- 방 코드별 room 관리

## 배포
Render Web Service (Node.js)

## 헬스체크
GET /ping → 200 OK