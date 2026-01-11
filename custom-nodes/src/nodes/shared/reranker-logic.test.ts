import { IExecuteFunctions, ISupplyDataFunctions, NodeApiError } from 'n8n-workflow';
import { 
	rerankDocuments, 
	checkServerStatus, 
	detectServerType,
	VLClassificationResult,
	ServerStatus
} from './reranker-logic';

describe('VL Classifier Integration', () => {
	let mockContext: Partial<IExecuteFunctions | ISupplyDataFunctions>;

	beforeEach(() => {
		mockContext = {
			getNode: jest.fn().mockReturnValue({ name: 'Test Node', type: 'testNode' }),
			getNodeParameter: jest.fn(),
			helpers: {
				httpRequest: jest.fn(),
			} as any,
			logger: {
				debug: jest.fn(),
				warn: jest.fn(),
				error: jest.fn(),
				info: jest.fn(),
			} as any,
		};
	});

	describe('checkServerStatus', () => {
		it('should detect VL classifier server capabilities', async () => {
			(mockContext.helpers!.httpRequest as jest.Mock).mockResolvedValue({
				status: 'healthy',
				models: ['ResNet18-ONNX'],
				vram_usage: 2.5,
				has_classifier: true,
				has_reranker: false,
				version: '1.0.0',
			});

			const status = await checkServerStatus(
				mockContext as any,
				'http://localhost:11434',
				5000
			);

			expect(status.status).toBe('healthy');
			expect(status.hasClassifier).toBe(true);
			expect(status.hasReranker).toBe(false);
			expect(status.modelsLoaded).toEqual(['ResNet18-ONNX']);
			expect(status.vramUsage).toBe(2.5);
		});

		it('should handle servers without /api/status endpoint', async () => {
			(mockContext.helpers!.httpRequest as jest.Mock).mockRejectedValue(
				new Error('404 Not Found')
			);

			const status = await checkServerStatus(
				mockContext as any,
				'http://localhost:11434',
				5000
			);

			expect(status.status).toBe('error');
			expect(status.hasClassifier).toBe(false);
			expect(status.hasReranker).toBe(false);
		});
	});

	describe('detectServerType', () => {
		it('should detect VL classifier server', async () => {
			// Mock /api/status returning VL classifier info
			(mockContext.helpers!.httpRequest as jest.Mock).mockImplementation((options) => {
				if (options.url.includes('/api/status')) {
					return Promise.resolve({
						status: 'healthy',
						has_classifier: true,
						has_reranker: true,
					});
				}
				return Promise.reject(new Error('404'));
			});

			const serverType = await detectServerType(
				mockContext as any,
				'http://localhost:11434'
			);

			expect(serverType).toBe('vl-classifier');
		});

		it('should detect Ollama server', async () => {
			// Mock /api/status not found, but /api/tags works
			(mockContext.helpers!.httpRequest as jest.Mock).mockImplementation((options) => {
				if (options.url.includes('/api/status')) {
					return Promise.reject(new Error('404'));
				}
				if (options.url.includes('/api/tags')) {
					return Promise.resolve({
						models: [{ name: 'llama2' }, { name: 'bge-reranker-v2-m3' }],
					});
				}
				return Promise.reject(new Error('404'));
			});

			const serverType = await detectServerType(
				mockContext as any,
				'http://localhost:11434'
			);

			expect(serverType).toBe('ollama');
		});

		it('should detect custom rerank API', async () => {
			// Mock /api/status and /api/tags not found, but /api/rerank works
			(mockContext.helpers!.httpRequest as jest.Mock).mockImplementation((options) => {
				if (options.url.includes('/api/status') || options.url.includes('/api/tags')) {
					return Promise.reject(new Error('404'));
				}
				if (options.url.includes('/api/rerank')) {
					return Promise.resolve({
						model: 'test',
						results: [],
					});
				}
				return Promise.reject(new Error('404'));
			});

			const serverType = await detectServerType(
				mockContext as any,
				'http://localhost:11434'
			);

			expect(serverType).toBe('custom');
		});
	});

	describe('rerankDocuments with VL Classifier', () => {
		it('should classify and rerank documents with VL classifier', async () => {
			const documents = [
				{ pageContent: 'Simple text document', metadata: {} },
				{ pageContent: 'Complex technical document with formulas', metadata: {} },
				{ pageContent: 'Another simple document', metadata: {} },
			];

			// Mock classification responses
			let classifyCallCount = 0;
			const classificationResults = ['LOW', 'HIGH', 'LOW'];

			(mockContext.helpers!.httpRequest as jest.Mock).mockImplementation((options) => {
				if (options.url.includes('/api/classify')) {
					const result = {
						complexity: classificationResults[classifyCallCount],
						confidence: 0.9,
						processing_time: 0.05,
						model: 'ResNet18-ONNX',
					};
					classifyCallCount++;
					return Promise.resolve(result);
				}
				if (options.url.includes('/api/status')) {
					return Promise.resolve({
						status: 'healthy',
						has_classifier: true,
						has_reranker: false,
					});
				}
				return Promise.reject(new Error('Unknown endpoint'));
			});

			const rerankedDocs = await rerankDocuments(mockContext as any, {
				ollamaHost: 'http://localhost:11434',
				model: 'test-model',
				query: 'technical documentation',
				documents,
				instruction: 'Find technical content',
				topK: 5,
				threshold: 0.0,
				batchSize: 10,
				timeout: 30000,
				includeOriginalScores: false,
				apiType: 'vl-classifier',
				enableClassification: true,
				classificationStrategy: 'metadata',
				filterComplexity: 'both',
			});

			// Verify all documents have classification metadata
			expect(rerankedDocs.length).toBe(3);
			expect(rerankedDocs[0]._complexityClass).toBeDefined();
			expect(rerankedDocs[0]._complexityConfidence).toBe(0.9);
		});

		it('should filter documents by complexity when filter strategy is used', async () => {
			const documents = [
				{ pageContent: 'Simple text document', metadata: {} },
				{ pageContent: 'Complex technical document', metadata: {} },
				{ pageContent: 'Another simple document', metadata: {} },
			];

			// Mock classification responses
			let classifyCallCount = 0;
			const classificationResults = ['LOW', 'HIGH', 'LOW'];

			(mockContext.helpers!.httpRequest as jest.Mock).mockImplementation((options) => {
				if (options.url.includes('/api/classify')) {
					const result = {
						complexity: classificationResults[classifyCallCount],
						confidence: 0.9,
					};
					classifyCallCount++;
					return Promise.resolve(result);
				}
				if (options.url.includes('/api/status')) {
					return Promise.resolve({
						status: 'healthy',
						has_classifier: true,
						has_reranker: false,
					});
				}
				return Promise.reject(new Error('Unknown endpoint'));
			});

			const rerankedDocs = await rerankDocuments(mockContext as any, {
				ollamaHost: 'http://localhost:11434',
				model: 'test-model',
				query: 'technical documentation',
				documents,
				instruction: 'Find technical content',
				topK: 5,
				threshold: 0.0,
				batchSize: 10,
				timeout: 30000,
				includeOriginalScores: false,
				apiType: 'vl-classifier',
				enableClassification: true,
				classificationStrategy: 'filter',
				filterComplexity: 'HIGH',
			});

			// Only HIGH complexity document should be returned
			expect(rerankedDocs.length).toBe(1);
			expect(rerankedDocs[0].pageContent).toContain('Complex technical document');
		});

		it('should pass model parameter to classification API', async () => {
			const documents = [
				{ pageContent: 'Test document', metadata: {} },
			];

			let capturedRequestBody: any = null;

			(mockContext.helpers!.httpRequest as jest.Mock).mockImplementation((options) => {
				if (options.url.includes('/api/classify')) {
					capturedRequestBody = options.body;
					return Promise.resolve({
						complexity: 'HIGH',
						confidence: 0.95,
						model: 'lfm25-vl',
					});
				}
				if (options.url.includes('/api/status')) {
					return Promise.resolve({
						status: 'healthy',
						has_classifier: true,
						has_reranker: false,
					});
				}
				return Promise.reject(new Error('Unknown endpoint'));
			});

			await rerankDocuments(mockContext as any, {
				ollamaHost: 'http://localhost:11434',
				model: 'lfm25-vl',  // Specific model to test
				query: 'test query',
				documents,
				instruction: 'Test instruction',
				topK: 5,
				threshold: 0.0,
				batchSize: 10,
				timeout: 30000,
				includeOriginalScores: false,
				apiType: 'vl-classifier',
				enableClassification: true,
				classificationStrategy: 'metadata',
				filterComplexity: 'both',
			});

			// Verify model parameter is passed in the request
			expect(capturedRequestBody).toBeDefined();
			expect(capturedRequestBody.model).toBe('lfm25-vl');
			expect(capturedRequestBody.text).toBeDefined();
		});

		it('should handle classification failures gracefully', async () => {
			const documents = [
				{ pageContent: 'Test document', metadata: {} },
			];

			(mockContext.helpers!.httpRequest as jest.Mock).mockImplementation((options) => {
				if (options.url.includes('/api/classify')) {
					return Promise.reject(new Error('Classification service unavailable'));
				}
				if (options.url.includes('/api/status')) {
					return Promise.resolve({
						status: 'healthy',
						has_classifier: true,
						has_reranker: false,
					});
				}
				return Promise.reject(new Error('Unknown endpoint'));
			});

			const rerankedDocs = await rerankDocuments(mockContext as any, {
				ollamaHost: 'http://localhost:11434',
				model: 'test-model',
				query: 'test query',
				documents,
				instruction: 'Test instruction',
				topK: 5,
				threshold: 0.0,
				batchSize: 10,
				timeout: 30000,
				includeOriginalScores: false,
				apiType: 'vl-classifier',
				enableClassification: true,
				classificationStrategy: 'metadata',
				filterComplexity: 'both',
			});

			// Document should still be returned with default LOW complexity
			expect(rerankedDocs.length).toBe(1);
			expect(rerankedDocs[0]._complexityClass).toBe('LOW');
			expect(rerankedDocs[0]._complexityConfidence).toBe(0);
		});
	});
});