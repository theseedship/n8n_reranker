import { OllamaReranker } from './OllamaReranker.node';
import { ISupplyDataFunctions } from 'n8n-workflow';

describe('OllamaReranker', () => {
	let node: OllamaReranker;
	let mockContext: Partial<ISupplyDataFunctions>;

	beforeEach(() => {
		node = new OllamaReranker();
		mockContext = {
			getNode: jest.fn().mockReturnValue({ name: 'Test Node', type: 'ollamaReranker' }),
			getNodeParameter: jest.fn(),
			getCredentials: jest.fn(),
			logger: {
				debug: jest.fn(),
				warn: jest.fn(),
				error: jest.fn(),
				info: jest.fn(),
			} as any,
			helpers: {
				httpRequest: jest.fn(),
			} as any,
			addInputData: jest.fn().mockReturnValue({ index: 0 }),
			addOutputData: jest.fn(),
		};
	});

	/**
	 * supplyData() reads parameters in this order:
	 *   model, apiType, instruction, additionalOptions
	 * Then rerank() reads: topK, threshold (per call)
	 * compressDocuments → rerank() then re-reads threshold for the wrapper.
	 */
	const setupSupplyDataParams = (apiType = 'custom') => {
		(mockContext.getNodeParameter as jest.Mock)
			.mockReturnValueOnce('bge-reranker-v2-m3') // model
			.mockReturnValueOnce(apiType) // apiType
			.mockReturnValueOnce('test instruction') // instruction
			.mockReturnValueOnce({}); // additionalOptions
	};

	const setupRerankParams = (topK = 10, threshold = 0.0) => {
		(mockContext.getNodeParameter as jest.Mock)
			.mockReturnValueOnce(topK)
			.mockReturnValueOnce(threshold);
	};

	describe('Node Configuration', () => {
		it('should have correct node metadata', () => {
			expect(node.description.displayName).toBe('Ollama Reranker');
			expect(node.description.name).toBe('ollamaReranker');
			expect(node.description.version).toBe(1);
		});

		it('should default API Type to custom (true cross-encoder)', () => {
			const apiTypeProperty = node.description.properties.find((p) => p.name === 'apiType');
			expect(apiTypeProperty).toBeDefined();
			expect((apiTypeProperty as any).default).toBe('custom');
		});

		it('should expose all three API type options', () => {
			const apiTypeProperty = node.description.properties.find((p) => p.name === 'apiType') as any;
			const values = apiTypeProperty.options.map((o: any) => o.value);
			expect(values).toEqual(expect.arrayContaining(['custom', 'vl-classifier', 'ollama']));
		});

		it('should load models dynamically from /api/tags', () => {
			const modelProperty = node.description.properties.find((p) => p.name === 'model') as any;
			expect(modelProperty.type).toBe('options');
			expect(modelProperty.typeOptions?.loadOptions?.routing?.request?.url).toBe('/api/tags');
		});

		it('should have topK parameter with correct constraints', () => {
			const topKProperty = node.description.properties.find((p) => p.name === 'topK') as any;
			expect(topKProperty.typeOptions.minValue).toBe(1);
			expect(topKProperty.typeOptions.maxValue).toBe(100);
		});
	});

	describe('supplyData', () => {
		it('should throw when model is empty', async () => {
			(mockContext.getNodeParameter as jest.Mock).mockReturnValueOnce('');

			await expect(node.supplyData.call(mockContext as ISupplyDataFunctions, 0)).rejects.toThrow(
				'Model selection is required',
			);
		});

		it('should throw when credentials lack baseUrl', async () => {
			setupSupplyDataParams();
			(mockContext.getCredentials as jest.Mock).mockResolvedValueOnce({});

			await expect(node.supplyData.call(mockContext as ISupplyDataFunctions, 0)).rejects.toThrow(
				'Ollama Base URL not configured',
			);
		});

		it('should initialize provider with correct interface', async () => {
			setupSupplyDataParams();
			(mockContext.getCredentials as jest.Mock).mockResolvedValueOnce({
				baseUrl: 'http://localhost:11434/',
			});

			const result = await node.supplyData.call(mockContext as ISupplyDataFunctions, 0);

			const provider = result.response as any;
			expect(provider.name).toBe('Ollama Reranker Provider');
			expect(provider.rerank).toBeInstanceOf(Function);
			expect(provider.compressDocuments).toBeInstanceOf(Function);
		});

		it('should strip trailing slash from baseUrl', async () => {
			setupSupplyDataParams();
			(mockContext.getCredentials as jest.Mock).mockResolvedValueOnce({
				baseUrl: 'http://localhost:11434/',
			});
			const result = await node.supplyData.call(mockContext as ISupplyDataFunctions, 0);
			const provider = result.response as any;
			expect(provider.description).toContain('bge-reranker-v2-m3');
		});
	});

	describe('Provider.rerank (Ollama API path)', () => {
		let provider: any;

		beforeEach(async () => {
			setupSupplyDataParams('ollama');
			(mockContext.getCredentials as jest.Mock).mockResolvedValueOnce({
				baseUrl: 'http://localhost:11434',
			});
			const result = await node.supplyData.call(mockContext as ISupplyDataFunctions, 0);
			provider = result.response;
			(mockContext.getNodeParameter as jest.Mock).mockReset();
		});

		it('should throw on empty query', async () => {
			setupRerankParams();
			await expect(
				provider.rerank({ query: '', documents: [{ pageContent: 'test' }] }),
			).rejects.toThrow('Query cannot be empty');
		});

		it('should return empty array when no documents provided', async () => {
			setupRerankParams();
			const result = await provider.rerank({ query: 'test query', documents: [] });
			expect(result).toEqual([]);
		});

		it('should reject topN < 1', async () => {
			setupRerankParams();
			await expect(
				provider.rerank({ query: 'test', documents: [{ pageContent: 'doc' }], topN: 0 }),
			).rejects.toThrow('topN/topK must be at least 1');
		});

		it('should clamp topN to 100 with a warning', async () => {
			setupRerankParams();
			(mockContext.helpers!.httpRequest as jest.Mock).mockResolvedValue({
				response: 'Relevance: 0.8',
			});

			await provider.rerank({
				query: 'test',
				documents: [{ pageContent: 'doc' }],
				topN: 150,
			});

			expect(mockContext.logger!.warn).toHaveBeenCalledWith(
				expect.stringContaining('exceeds recommended maximum'),
			);
		});

		it('should rank documents by score descending', async () => {
			setupRerankParams();
			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce({ response: 'Relevance: 0.9' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.3' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.7' });

			const result = await provider.rerank({
				query: 'test query',
				documents: [{ pageContent: 'Doc 1' }, { pageContent: 'Doc 2' }, { pageContent: 'Doc 3' }],
			});

			expect(result).toHaveLength(3);
			expect(result[0]._rerankScore).toBeGreaterThan(result[1]._rerankScore);
			expect(result[1]._rerankScore).toBeGreaterThan(result[2]._rerankScore);
		});

		it('should drop documents below threshold', async () => {
			setupRerankParams(10, 0.5);
			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce({ response: 'Relevance: 0.9' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.3' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.7' });

			const result = await provider.rerank({
				query: 'test query',
				documents: [{ pageContent: 'Doc 1' }, { pageContent: 'Doc 2' }, { pageContent: 'Doc 3' }],
			});

			expect(result).toHaveLength(2);
			expect(result.every((doc: any) => doc._rerankScore >= 0.5)).toBe(true);
		});

		it('should respect topK limit', async () => {
			setupRerankParams(2);
			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce({ response: 'Relevance: 0.9' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.8' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.7' });

			const result = await provider.rerank({
				query: 'test query',
				documents: [{ pageContent: 'Doc 1' }, { pageContent: 'Doc 2' }, { pageContent: 'Doc 3' }],
			});
			expect(result).toHaveLength(2);
		});

		it('should accept multiple document content field names', async () => {
			setupRerankParams();
			(mockContext.helpers!.httpRequest as jest.Mock).mockResolvedValue({
				response: 'Relevance: 0.8',
			});

			const result = await provider.rerank({
				query: 'test',
				documents: [
					{ pageContent: 'Standard format' },
					{ text: 'Text property' },
					{ content: 'Content property' },
					{ document: 'Document property' },
					'Plain string',
				],
			});

			expect(result).toHaveLength(5);
			result.forEach((doc: any) => {
				expect(doc.pageContent).toBeDefined();
				expect(doc._rerankScore).toBeDefined();
				expect(doc._originalIndex).toBeDefined();
			});
		});

		it('should preserve original metadata on the doc root', async () => {
			setupRerankParams();
			(mockContext.helpers!.httpRequest as jest.Mock).mockResolvedValue({
				response: 'Relevance: 0.8',
			});

			const result = await provider.rerank({
				query: 'test',
				documents: [
					{
						pageContent: 'Test doc',
						metadata: { source: 'file.txt', page: 1 },
					},
				],
			});

			expect(result[0].metadata).toEqual({ source: 'file.txt', page: 1 });
		});
	});

	describe('Provider.compressDocuments (LangChain interface)', () => {
		let provider: any;

		beforeEach(async () => {
			setupSupplyDataParams('ollama');
			(mockContext.getCredentials as jest.Mock).mockResolvedValueOnce({
				baseUrl: 'http://localhost:11434',
			});
			const result = await node.supplyData.call(mockContext as ISupplyDataFunctions, 0);
			provider = result.response;
			(mockContext.getNodeParameter as jest.Mock).mockReset();
		});

		it('should embed _rerankScore and _originalIndex inside metadata (GH #1)', async () => {
			// compressDocuments calls rerank, which reads topK + threshold,
			// then re-reads threshold itself when constructing the call.
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(0.0) // outer threshold (compressDocuments)
				.mockReturnValueOnce(10) // topK (rerank)
				.mockReturnValueOnce(0.0); // threshold (rerank)

			(mockContext.helpers!.httpRequest as jest.Mock).mockResolvedValue({
				response: 'Relevance: 0.8',
			});

			const documents = [{ pageContent: 'Test doc', metadata: { source: 'file.txt' } }];

			const result = await provider.compressDocuments(documents, 'test query');

			expect(result).toHaveLength(1);
			// Helper fields removed from doc root (LangChain shape preserved)
			expect(result[0]._rerankScore).toBeUndefined();
			expect(result[0]._originalIndex).toBeUndefined();
			// But available via metadata for quality assessment
			expect(result[0].metadata._rerankScore).toBeDefined();
			expect(result[0].metadata._originalIndex).toBe(0);
			// Original metadata still preserved
			expect(result[0].metadata.source).toBe('file.txt');
			// Original page content unchanged
			expect(result[0].pageContent).toBe('Test doc');
		});

		it('should still embed metadata when document has no metadata field', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(0.0)
				.mockReturnValueOnce(10)
				.mockReturnValueOnce(0.0);

			(mockContext.helpers!.httpRequest as jest.Mock).mockResolvedValue({
				response: 'Relevance: 0.8',
			});

			const result = await provider.compressDocuments(
				[{ pageContent: 'No metadata' }],
				'test query',
			);

			expect(result[0].metadata).toBeDefined();
			expect(result[0].metadata._rerankScore).toBeGreaterThan(0);
			expect(result[0].metadata._originalIndex).toBe(0);
		});
	});

	describe('Retry Logic', () => {
		let provider: any;

		beforeEach(async () => {
			setupSupplyDataParams('ollama');
			(mockContext.getCredentials as jest.Mock).mockResolvedValueOnce({
				baseUrl: 'http://localhost:11434',
			});
			const result = await node.supplyData.call(mockContext as ISupplyDataFunctions, 0);
			provider = result.response;
			(mockContext.getNodeParameter as jest.Mock).mockReset();
		});

		it('should retry on transient errors (AbortError)', async () => {
			setupRerankParams();
			const timeoutError = new Error('Timeout');
			(timeoutError as any).name = 'AbortError';

			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockRejectedValueOnce(timeoutError)
				.mockRejectedValueOnce(timeoutError)
				.mockResolvedValueOnce({ response: 'Relevance: 0.8' });

			const result = await provider.rerank({
				query: 'test',
				documents: [{ pageContent: 'Test doc' }],
			});

			expect(result).toHaveLength(1);
			expect(mockContext.helpers!.httpRequest).toHaveBeenCalledTimes(3);
		});

		it('should not retry on 404 (permanent error)', async () => {
			setupRerankParams();
			const notFoundError = new Error('Not found');
			(notFoundError as any).response = { statusCode: 404 };

			(mockContext.helpers!.httpRequest as jest.Mock).mockRejectedValue(notFoundError);

			await expect(
				provider.rerank({ query: 'test', documents: [{ pageContent: 'Test doc' }] }),
			).rejects.toThrow();

			expect(mockContext.helpers!.httpRequest).toHaveBeenCalledTimes(1);
		});
	});
});
