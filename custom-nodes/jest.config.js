module.exports = {
	preset: 'ts-jest',
	testEnvironment: 'node',
	roots: ['<rootDir>/src'],
	testMatch: ['**/*.test.ts'],
	collectCoverageFrom: [
		'src/**/*.ts',
		'!src/**/*.test.ts',
		'!src/**/*.d.ts',
	],
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov', 'html'],
	verbose: true,
	moduleFileExtensions: ['ts', 'js', 'json'],
	transform: {
		'^.+\\.ts$': ['ts-jest', {
			tsconfig: {
				target: 'ES2019',
				module: 'commonjs',
				esModuleInterop: true,
				skipLibCheck: true,
			},
		}],
	},
};
