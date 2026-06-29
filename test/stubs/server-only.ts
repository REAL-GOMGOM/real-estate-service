// vitest 환경에서 'server-only' import 를 무력화하는 stub.
// 실제 'server-only' 패키지는 클라이언트 번들에서 빌드 에러를 내기 위한 것으로,
// node 기반 테스트에서는 의미가 없고 로딩 시 throw 하므로 빈 모듈로 대체한다.
export {};
