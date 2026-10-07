module.exports = {
 rootDir:'.',testEnvironment:'node',testMatch:['<rootDir>/audit-db-tests/**/*.test.ts'],
 transform:{'^.+\\.ts$':['ts-jest',{tsconfig:{module:'CommonJS',esModuleInterop:true},diagnostics:true}]},
 maxWorkers:1,cache:false,testTimeout:20000,setupFiles:['<rootDir>/audit-db-tests/safety.cjs']
}
