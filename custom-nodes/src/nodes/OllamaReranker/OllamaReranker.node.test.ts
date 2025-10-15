import { OllamaReranker } from './OllamaReranker.node';
import { ISupplyDataFunctions, NodeOperationError, NodeApiError } from 'n8n-workflow';

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

	describe('Node Configuration', () => {
		it('should have correct node metadata', () => {
			expect(node.description.displayName).toBe('Ollama Reranker');
			expect(node.description.name).toBe('ollamaReranker');
			expect(node.description.version).toBe(1);
		});

		it('should have correct model options', () => {
			const modelProperty = node.description.properties.find(p => p.name === 'model');
			expect(modelProperty).toBeDefined();
			expect(modelProperty?.type).toBe('options');
			const options = (modelProperty as any).options;
			expect(options).toHaveLength(5);
			expect(options.map((o: any) => o.value)).toContain('bge-reranker-v2-m3');
		});

		it('should have topK parameter with correct constraints', () => {
			const topKProperty = node.description.properties.find(p => p.name === 'topK');
			expect(topKProperty).toBeDefined();
			expect((topKProperty as any).typeOptions.minValue).toBe(1);
			expect((topKProperty as any).typeOptions.maxValue).toBe(100);
		});
	});

	describe('supplyData', () => {
		it('should throw error for empty custom model name', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('custom') // model
				.mockReturnValueOnce(''); // customModel

			await expect(
				node.supplyData.call(mockContext as ISupplyDataFunctions, 0)
			).rejects.toThrow('Custom model name is required');
		});

		it('should initialize provider with correct credentials', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('bge-reranker-v2-m3') // model
				.mockReturnValueOnce('test instruction') // instruction
				.mockReturnValueOnce({}); // additionalOptions

			(mockContext.getCredentials as jest.Mock).mockResolvedValueOnce({
				host: 'http://localhost:11434/',
			});

			const result = await node.supplyData.call(mockContext as ISupplyDataFunctions, 0);

			expect(result.response).toBeDefined();
			const provider = result.response as any;
			expect(provider.name).toBe('Ollama Reranker Provider');
			expect(provider.rerank).toBeInstanceOf(Function);
			expect(provider.compressDocuments).toBeInstanceOf(Function);
		});

		it('should use custom model when specified', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('custom') // model
				.mockReturnValueOnce('my-custom-model:latest') // customModel
				.mockReturnValueOnce('test instruction') // instruction
				.mockReturnValueOnce({}); // additionalOptions

			(mockContext.getCredentials as jest.Mock).mockResolvedValueOnce({
				host: 'http://localhost:11434',
			});

			const result = await node.supplyData.call(mockContext as ISupplyDataFunctions, 0);

			const provider = result.response as any;
			expect(provider.description).toContain('my-custom-model:latest');
		});
	});

	describe('Provider.rerank', () => {
		let provider: any;

		beforeEach(async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('bge-reranker-v2-m3') // model
				.mockReturnValueOnce('test instruction') // instruction
				.mockReturnValueOnce({}); // additionalOptions

			(mockContext.getCredentials as jest.Mock).mockResolvedValueOnce({
				host: 'http://localhost:11434',
			});

			const result = await node.supplyData.call(mockContext as ISupplyDataFunctions, 0);
			provider = result.response;

			// Reset mocks for rerank method
			(mockContext.getNodeParameter as jest.Mock).mockReset();
		});

		it('should throw error for empty query', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(10) // topK
				.mockReturnValueOnce(0.0); // threshold

			await expect(
				provider.rerank({ query: '', documents: [{ pageContent: 'test' }] })
			).rejects.toThrow('Query cannot be empty');
		});

		it('should return empty array for no documents', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(10) // topK
				.mockReturnValueOnce(0.0); // threshold

			const result = await provider.rerank({ query: 'test query', documents: [] });

			expect(result).toEqual([]);
		});

		it('should validate topN parameter', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(10) // topK (not used)
				.mockReturnValueOnce(0.0); // threshold

			await expect(
				provider.rerank({ query: 'test', documents: [{ pageContent: 'doc' }], topN: 0 })
			).rejects.toThrow('topN/topK must be at least 1');
		});

		it('should clamp topN to maximum of 100', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(10) // topK (not used)
				.mockReturnValueOnce(0.0) // threshold
				.mockReturnValueOnce('test instruction') // instruction
				.mockReturnValueOnce(0.0); // threshold for rerank function

			(mockContext.helpers!.httpRequest as jest.Mock).mockResolvedValue({
				response: 'Relevance: 0.8',
			});

			await provider.rerank({
				query: 'test',
				documents: [{ pageContent: 'doc' }],
				topN: 150,
			});

			expect(mockContext.logger!.warn).toHaveBeenCalledWith(
				expect.stringContaining('exceeds recommended maximum')
			);
		});

		it('should rerank documents with scores', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(10) // topK
				.mockReturnValueOnce(0.0); // threshold

			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce({ response: 'Relevance: 0.9' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.3' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.7' });

			const documents = [
				{ pageContent: 'Doc 1' },
				{ pageContent: 'Doc 2' },
				{ pageContent: 'Doc 3' },
			];

			const result = await provider.rerank({ query: 'test query', documents });

			expect(result).toHaveLength(3);
			expect(result[0]._rerankScore).toBeGreaterThan(result[1]._rerankScore);
			expect(result[1]._rerankScore).toBeGreaterThan(result[2]._rerankScore);
		});

		it('should filter by threshold', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(10) // topK
				.mockReturnValueOnce(0.5); // threshold

			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce({ response: 'Relevance: 0.9' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.3' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.7' });

			const documents = [
				{ pageContent: 'Doc 1' },
				{ pageContent: 'Doc 2' },
				{ pageContent: 'Doc 3' },
			];

			const result = await provider.rerank({ query: 'test query', documents });

			expect(result).toHaveLength(2);
			expect(result.every((doc: any) => doc._rerankScore >= 0.5)).toBe(true);
		});

		it('should respect topK limit', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(2) // topK
				.mockReturnValueOnce(0.0); // threshold

			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockResolvedValueOnce({ response: 'Relevance: 0.9' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.8' })
				.mockResolvedValueOnce({ response: 'Relevance: 0.7' });

			const documents = [
				{ pageContent: 'Doc 1' },
				{ pageContent: 'Doc 2' },
				{ pageContent: 'Doc 3' },
			];

			const result = await provider.rerank({ query: 'test query', documents });

			expect(result).toHaveLength(2);
		});

		it('should handle different document formats', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(10) // topK
				.mockReturnValueOnce(0.0); // threshold

			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockResolvedValue({ response: 'Relevance: 0.8' });

			const documents = [
				{ pageContent: 'Standard format' },
				{ text: 'Text property' },
				{ content: 'Content property' },
				{ document: 'Document property' },
				'Plain string',
			];

			const result = await provider.rerank({ query: 'test', documents });

			expect(result).toHaveLength(5);
			result.forEach((doc: any) => {
				expect(doc.pageContent).toBeDefined();
				expect(doc._rerankScore).toBeDefined();
				expect(doc._originalIndex).toBeDefined();
			});
		});

		it('should preserve original metadata', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(10) // topK
				.mockReturnValueOnce(0.0); // threshold

			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockResolvedValue({ response: 'Relevance: 0.8' });

			const documents = [
				{
					pageContent: 'Test doc',
					metadata: { source: 'file.txt', page: 1 },
				},
			];

			const result = await provider.rerank({ query: 'test', documents });

			expect(result[0].metadata).toEqual({ source: 'file.txt', page: 1 });
		});
	});

	describe('Provider.compressDocuments', () => {
		let provider: any;

		beforeEach(async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('bge-reranker-v2-m3') // model
				.mockReturnValueOnce('test instruction') // instruction
				.mockReturnValueOnce({}); // additionalOptions

			(mockContext.getCredentials as jest.Mock).mockResolvedValueOnce({
				host: 'http://localhost:11434',
			});

			const result = await node.supplyData.call(mockContext as ISupplyDataFunctions, 0);
			provider = result.response;

			(mockContext.getNodeParameter as jest.Mock).mockReset();
		});

		it('should remove helper fields from output', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValue(10) // topK
				.mockReturnValueOnce(0.0); // threshold

			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockResolvedValue({ response: 'Relevance: 0.8' });

			const documents = [{ pageContent: 'Test doc' }];

			const result = await provider.compressDocuments(documents, 'test query');

			expect(result).toHaveLength(1);
			expect(result[0]._rerankScore).toBeUndefined();
			expect(result[0]._originalIndex).toBeUndefined();
			expect(result[0].pageContent).toBe('Test doc');
		});
	});

	describe('Retry Logic', () => {
		let provider: any;

		beforeEach(async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce('bge-reranker-v2-m3') // model
				.mockReturnValueOnce('test instruction') // instruction
				.mockReturnValueOnce({}); // additionalOptions

			(mockContext.getCredentials as jest.Mock).mockResolvedValueOnce({
				host: 'http://localhost:11434',
			});

			const result = await node.supplyData.call(mockContext as ISupplyDataFunctions, 0);
			provider = result.response;

			(mockContext.getNodeParameter as jest.Mock).mockReset();
		});

		it('should retry on timeout errors', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(10) // topK
				.mockReturnValueOnce(0.0); // threshold

			const timeoutError = new Error('Timeout');
			(timeoutError as any).name = 'AbortError';

			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockRejectedValueOnce(timeoutError)
				.mockRejectedValueOnce(timeoutError)
				.mockResolvedValueOnce({ response: 'Relevance: 0.8' });

			const documents = [{ pageContent: 'Test doc' }];
			const result = await provider.rerank({ query: 'test', documents });

			expect(result).toHaveLength(1);
			expect(mockContext.helpers!.httpRequest).toHaveBeenCalledTimes(3);
		});

		it('should not retry on 404 errors', async () => {
			(mockContext.getNodeParameter as jest.Mock)
				.mockReturnValueOnce(10) // topK
				.mockReturnValueOnce(0.0); // threshold

			const notFoundError = new Error('Not found');
			(notFoundError as any).response = { statusCode: 404 };

			(mockContext.helpers!.httpRequest as jest.Mock)
				.mockRejectedValue(notFoundError);

			const documents = [{ pageContent: 'Test doc' }];

			await expect(
				provider.rerank({ query: 'test', documents })
			).rejects.toThrow();

			expect(mockContext.helpers!.httpRequest).toHaveBeenCalledTimes(1);
		});
	});

	describe('Score Parsing', () => {
		it('should parse BGE numeric scores', () => {
			// This would test the parseRerankerResponse function
			// but it's not exported. Consider exporting it for testing
			// or testing through integration tests
		});

		it('should parse Qwen yes/no responses', () => {
			// Similar to above
		});
	});

	describe('Prompt Formatting', () => {
		it('should format BGE prompts correctly', () => {
			// This would test the formatRerankerPrompt function
			// Consider exporting it for testing
		});

		it('should format Qwen prompts correctly', () => {
			// Similar to above
		});
	});
});
