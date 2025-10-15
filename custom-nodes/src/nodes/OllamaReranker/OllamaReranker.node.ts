import {
	ISupplyDataFunctions,
	SupplyData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
	NodeApiError,
	JsonObject,
} from 'n8n-workflow';

/**
 * Ollama Reranker Provider
 *
 * A reranker sub-node that integrates with n8n's Vector Store nodes.
 * Uses Ollama reranker models (like Qwen3-Reranker) to reorder documents by relevance.
 *
 * IMPORTANT: Due to current n8n limitations, community nodes cannot use NodeConnectionTypes.AiReranker.
 * This node is implemented correctly following n8n patterns, but won't function until n8n lifts this restriction.
 *
 * See: https://community.n8n.io/t/feature-request-enable-nodeconnectiontypes-aireranker-for-community-nodes
 */
export class OllamaReranker implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Ollama Reranker',
		name: 'ollamaReranker',
		icon: 'file:ollama.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["model"]}}',
		description: 'Rerank documents using Ollama reranker models (integrates with Vector Stores)',
		defaults: {
			name: 'Ollama Reranker',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Chains', 'Root Nodes'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://github.com/ollama/ollama/blob/main/docs/api.md',
					},
				],
			},
		},
		// Sub-node pattern: No inputs, output is AiReranker type
		inputs: [],
		outputs: [NodeConnectionTypes.AiReranker],
		outputNames: ['Reranker'],
		credentials: [
			{
				// Use n8n's built-in Ollama credential (NOT custom!)
				name: 'ollamaApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Model',
				name: 'model',
				type: 'options',
				options: [
					{
						name: 'BGE Reranker v2-M3 (Recommended)',
						value: 'bge-reranker-v2-m3',
						description: 'Best general-purpose reranker, excellent balance of speed and accuracy',
					},
					{
						name: 'Qwen3-Reranker-0.6B (Fast)',
						value: 'dengcao/Qwen3-Reranker-0.6B:Q5_K_M',
						description: 'Fastest option, best for resource-limited environments',
					},
					{
						name: 'Qwen3-Reranker-4B (Balanced)',
						value: 'dengcao/Qwen3-Reranker-4B:Q5_K_M',
						description: 'Recommended for Qwen family - best balance of speed and accuracy',
					},
					{
						name: 'Qwen3-Reranker-8B (Most Accurate)',
						value: 'dengcao/Qwen3-Reranker-8B:Q5_K_M',
						description: 'Highest accuracy, requires more resources',
					},
					{
						name: 'Custom Model',
						value: 'custom',
						description: 'Specify your own Ollama reranker model',
					},
				],
				default: 'bge-reranker-v2-m3',
				description: 'The Ollama reranker model to use',
			},
			{
				displayName: 'Custom Model Name',
				name: 'customModel',
				type: 'string',
				default: '',
				placeholder: 'your-reranker-model:tag',
				description: 'Name of your custom Ollama reranker model',
				displayOptions: {
					show: {
						model: ['custom'],
					},
				},
			},
			{
				displayName: 'Top K',
				name: 'topK',
				type: 'number',
				default: 10,
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				description: 'Maximum number of top-ranked documents to return',
			},
			{
				displayName: 'Score Threshold',
				name: 'threshold',
				type: 'number',
				default: 0.0,
				typeOptions: {
					minValue: 0,
					maxValue: 1,
					numberPrecision: 2,
				},
				description: 'Minimum relevance score (0-1) required to include document in results',
			},
			{
				displayName: 'Task Instruction',
				name: 'instruction',
				type: 'string',
				default: 'Given a web search query, retrieve relevant passages that answer the query',
				description: 'Custom instruction for the reranking task (improves accuracy for specific use cases)',
			},
			{
				displayName: 'Additional Options',
				name: 'additionalOptions',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Include Original Scores',
						name: 'includeOriginalScores',
						type: 'boolean',
						default: false,
						description: 'Whether to include original document scores in output (if available)',
					},
					{
						displayName: 'Request Timeout (ms)',
						name: 'timeout',
						type: 'number',
						default: 30000,
						typeOptions: {
							minValue: 1000,
							maxValue: 300000,
						},
						description: 'Maximum time to wait for each API request in milliseconds',
					},
					{
						displayName: 'Batch Size',
						name: 'batchSize',
						type: 'number',
						default: 10,
						typeOptions: {
							minValue: 1,
							maxValue: 50,
						},
						description: 'Number of documents to process concurrently',
					},
				],
			},
		],
	};

	/**
	 * Supply Data Method (NOT execute!)
	 *
	 * Provider nodes use supplyData() to return a reranker provider object
	 * that implements the standard rerank() and compressDocuments() interfaces.
	 */
	async supplyData(this: ISupplyDataFunctions, _itemIndex: number): Promise<SupplyData> {
		this.logger.debug('Initializing Ollama Reranker Provider');
		const self = this;

		// Get node parameters once (provider nodes use index 0)
		let model = this.getNodeParameter('model', 0) as string;
		if (model === 'custom') {
			model = this.getNodeParameter('customModel', 0) as string;
			if (!model || !model.trim()) {
				throw new NodeOperationError(
					this.getNode(),
					'Custom model name is required when "Custom Model" is selected',
				);
			}
		}

		const instruction = this.getNodeParameter('instruction', 0) as string;
		const additionalOptions = this.getNodeParameter('additionalOptions', 0, {}) as {
			includeOriginalScores?: boolean;
			timeout?: number;
			batchSize?: number;
		};

		const timeout = additionalOptions.timeout || 30000;
		const batchSize = additionalOptions.batchSize || 10;
		const includeOriginalScores = additionalOptions.includeOriginalScores || false;

		// Get credentials (n8n's built-in ollamaApi)
		const credentials = await this.getCredentials('ollamaApi');
		const ollamaHost = (credentials.host as string).replace(/\/$/, '');

		/**
		 * Reranker Provider Object
		 *
		 * This object implements the standard interface that Vector Store nodes expect.
		 * It must have both rerank() and compressDocuments() methods.
		 */
		const provider = {
			name: 'Ollama Reranker Provider',
			description: `Reranks documents using Ollama model: ${model}`,

			/**
			 * rerank() - Primary method called by Vector Store nodes
			 *
			 * @param input.query - The search query to rank documents against
			 * @param input.documents - Array of documents to rerank
			 * @param input.topN - Optional override for top K parameter
			 * @param input.threshold - Optional override for score threshold
			 * @returns Array of reranked documents with _rerankScore and _originalIndex
			 */
			rerank: async (input: { query: string; documents: any[]; topN?: number; threshold?: number }) => {
				// Log input for n8n execution tracking
				const { index } = self.addInputData(NodeConnectionTypes.AiReranker, [
					[{ json: { query: input.query, documents: input.documents } }],
				]);

				const { query, documents } = input || {};

				// Get parameters with optional overrides from input
				let topK = input?.topN ?? (self.getNodeParameter('topK', 0) as number);
				const threshold = input?.threshold ?? (self.getNodeParameter('threshold', 0) as number);

				// Validate topN parameter
				if (topK < 1) {
					throw new NodeOperationError(self.getNode(), 'topN/topK must be at least 1');
				}
				if (topK > 100) {
					self.logger.warn(`topN=${topK} exceeds recommended maximum of 100, clamping to 100`);
					topK = 100;
				}

				// Validate inputs
				if (!query || !query.trim()) {
					throw new NodeOperationError(self.getNode(), 'Query cannot be empty');
				}

				const docs = Array.isArray(documents) ? documents : [];
				if (docs.length === 0) {
					self.logger.debug('No documents to rerank, returning empty array');
					return [];
				}

				// Convert documents to standard format
				const processedDocs = docs.map((doc, docIndex) => {
					if (doc && typeof doc === 'object') {
						return {
							pageContent: doc.pageContent || doc.text || doc.content || doc.document || JSON.stringify(doc),
							metadata: doc.metadata || {},
							_originalIndex: docIndex,
							...(doc._originalScore !== undefined ? { _originalScore: doc._originalScore } : {}),
						};
					}
					return {
						pageContent: String(doc),
						metadata: {},
						_originalIndex: docIndex,
					};
				});

				self.logger.debug(`Reranking ${processedDocs.length} documents with model: ${model}`);

				try {
					// Rerank documents using Ollama
					const rerankedDocs = await rerankDocuments(
						self,
						ollamaHost,
						model,
						query,
						processedDocs,
						instruction,
						topK,
						threshold,
						batchSize,
						timeout,
						includeOriginalScores,
					);

					self.logger.debug(`Reranking complete: ${rerankedDocs.length} documents returned`);

					// Log output for n8n execution tracking
					self.addOutputData(NodeConnectionTypes.AiReranker, index, [
						[{ json: { response: rerankedDocs } }],
					]);

					return rerankedDocs;
				} catch (error) {
					self.logger.error(`Reranking failed: ${(error as Error).message}`);
					throw error;
				}
			},

			/**
			 * compressDocuments() - LangChain BaseDocumentCompressor interface
			 *
			 * Provides backward compatibility with LangChain patterns.
			 * Returns documents without helper fields (_rerankScore, _originalIndex).
			 */
			compressDocuments: async (documents: any[], query: string, topN?: number) => {
				const ranked = await provider.rerank({
					query,
					documents,
					topN,
					threshold: self.getNodeParameter('threshold', 0) as number,
				});

				// Return clean documents (remove helper fields for LangChain compatibility)
				return ranked.map((doc: any) => {
					const { _rerankScore, _originalIndex, ...cleanDoc } = doc;
					return cleanDoc;
				});
			},
		};

		return { response: provider };
	}
}

/**
 * Rerank documents using Ollama reranker model
 */
async function rerankDocuments(
	context: ISupplyDataFunctions,
	ollamaHost: string,
	model: string,
	query: string,
	documents: any[],
	instruction: string,
	topK: number,
	threshold: number,
	batchSize: number,
	timeout: number,
	includeOriginalScores: boolean,
): Promise<any[]> {
	const results: Array<{ index: number; score: number }> = [];

	// Process all documents concurrently with controlled concurrency
	const promises: Array<Promise<{ index: number; score: number }>> = [];

	for (let i = 0; i < documents.length; i++) {
		const doc = documents[i];
		const promise = scoreDocument(
			context,
			ollamaHost,
			model,
			query,
			doc.pageContent,
			instruction,
			timeout,
		).then(score => ({
			index: i,
			score,
		}));

		promises.push(promise);

		// Process in batches to avoid overwhelming the API
		if (promises.length >= batchSize || i === documents.length - 1) {
			const batchResults = await Promise.all(promises);
			results.push(...batchResults);
			promises.length = 0; // Clear the array
		}
	}

	// Filter by threshold and sort by score (descending)
	const filteredResults = results
		.filter(r => r.score >= threshold)
		.sort((a, b) => b.score - a.score)
		.slice(0, topK);

	// Map back to original documents with scores
	return filteredResults.map(result => {
		const originalDoc = documents[result.index];
		const rerankedDoc: any = {
			...originalDoc,
			_rerankScore: result.score,
			_originalIndex: result.index,
		};

		if (includeOriginalScores && originalDoc._originalScore !== undefined) {
			rerankedDoc._originalScore = originalDoc._originalScore;
		}

		return rerankedDoc;
	});
}

/**
 * Score a single document against the query using Ollama reranker model with retry logic
 */
async function scoreDocument(
	context: ISupplyDataFunctions,
	ollamaHost: string,
	model: string,
	query: string,
	documentContent: string,
	instruction: string,
	timeout: number,
): Promise<number> {
	// Format prompt based on model type
	const prompt = formatRerankerPrompt(model, query, documentContent, instruction);

	const maxRetries = 3;
	let lastError: any;

	for (let attempt = 0; attempt < maxRetries; attempt++) {
		try {
			// Use Ollama /api/generate endpoint for reranker models
			const response = await context.helpers.httpRequest({
				method: 'POST',
				url: `${ollamaHost}/api/generate`,
				headers: {
					'Content-Type': 'application/json',
					Accept: 'application/json',
				},
				body: {
					model,
					prompt,
					stream: false,
					options: {
						temperature: 0.0, // Deterministic scoring
					},
				},
				json: true,
				timeout,
			});

			// Parse the response to extract relevance score
			const score = parseRerankerResponse(model, response);
			return score;
		} catch (error: any) {
			lastError = error;

			// Don't retry on permanent errors
			if (error?.response?.statusCode === 404 || error?.response?.statusCode === 400) {
				break;
			}

			// Retry on transient errors (timeout, 5xx, network issues)
			if (attempt < maxRetries - 1) {
				const isTransient = error?.name === 'AbortError' ||
					error?.code === 'ETIMEDOUT' ||
					error?.response?.statusCode >= 500;

				if (isTransient) {
					// Exponential backoff: 100ms, 200ms, 400ms
					await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
					continue;
				}
			}
			break;
		}
	}

	// Handle final error after retries
	const error = lastError;
	if (error?.name === 'AbortError' || error?.code === 'ETIMEDOUT') {
		throw new NodeApiError(context.getNode(), error, {
			message: `Request timeout after ${timeout}ms (tried ${maxRetries} times)`,
			description: `Model: ${model}\nEndpoint: ${ollamaHost}/api/generate`,
		});
	}

	if (error?.response?.body) {
		throw new NodeApiError(context.getNode(), error, {
			message: `Ollama API Error (${error.response.statusCode})`,
			description: `Endpoint: ${ollamaHost}/api/generate\nModel: ${model}\nResponse: ${JSON.stringify(error.response.body, null, 2)}`,
		});
	}

	throw new NodeApiError(context.getNode(), error as JsonObject, {
		message: 'Ollama reranking request failed',
		description: `Endpoint: ${ollamaHost}/api/generate\nModel: ${model}\nError: ${error.message}`,
	});
}

/**
 * Format prompt based on reranker model type
 *
 * Different models expect different prompt formats:
 * - BGE Reranker: Simple query + document format
 * - Qwen3-Reranker: Structured chat format with system/user/assistant tags
 */
function formatRerankerPrompt(model: string, query: string, documentContent: string, instruction: string): string {
	// Detect model type
	const isBGE = model.toLowerCase().includes('bge');
	const isQwen = model.toLowerCase().includes('qwen');

	if (isBGE) {
		// BGE Reranker uses a simple format
		// See: https://huggingface.co/BAAI/bge-reranker-v2-m3
		return `Instruction: ${instruction}

Query: ${query}

Document: ${documentContent}

Relevance:`;
	} else if (isQwen) {
		// Qwen3-Reranker uses structured chat format
		// See: https://huggingface.co/dengcao/Qwen3-Reranker-4B
		return `<|im_start|>system
Judge whether the Document meets the requirements based on the Query and the Instruct provided. Note that the answer can only be "yes" or "no".<|im_end|>
<|im_start|>user
<Instruct>: ${instruction}
<Query>: ${query}
<Document>: ${documentContent}<|im_end|>
<|im_start|>assistant
<think>`;
	}

	// Default format for unknown models (similar to BGE)
	return `Task: ${instruction}

Query: ${query}

Document: ${documentContent}

Score:`;
}

/**
 * Parse Ollama reranker response to extract relevance score
 * Uses model-specific parsing logic for better accuracy
 */
function parseRerankerResponse(model: string, response: any): number {
	if (!response || !response.response) {
		return 0.0;
	}

	const output = response.response as string;
	const outputLower = output.toLowerCase();
	const isBGE = model.toLowerCase().includes('bge');
	const isQwen = model.toLowerCase().includes('qwen');

	// BGE models typically return numeric scores directly
	if (isBGE) {
		// Try to extract floating point number
		const scoreMatch = output.match(/([0-9]*\.?[0-9]+)/);
		if (scoreMatch) {
			const score = parseFloat(scoreMatch[1]);
			// BGE returns scores in various ranges, normalize to 0-1
			if (score > 1 && score <= 10) {
				return score / 10;
			} else if (score > 10) {
				return score / 100;
			}
			return Math.min(Math.max(score, 0), 1); // Clamp to 0-1
		}

		// Fallback: check for keywords
		if (outputLower.includes('high') || outputLower.includes('relevant')) {
			return 0.8;
		}
		if (outputLower.includes('low') || outputLower.includes('irrelevant')) {
			return 0.2;
		}
	}

	// Qwen models return yes/no with reasoning
	if (isQwen) {
		// Look for explicit yes/no in the response
		const yesMatch = outputLower.match(/\b(yes|relevant|positive|match)\b/);
		const noMatch = outputLower.match(/\b(no|irrelevant|negative|not\s+relevant)\b/);

		if (yesMatch && !noMatch) {
			// Higher confidence for detailed explanations
			const hasReasoning = output.length > 100;
			const hasMultiplePositives = (output.match(/relevant|yes|match/gi) || []).length > 1;

			if (hasReasoning && hasMultiplePositives) return 0.95;
			if (hasReasoning) return 0.85;
			return 0.75;
		}

		if (noMatch && !yesMatch) {
			// Low scores for negative responses
			const hasStrongNegative = outputLower.includes('completely') ||
				outputLower.includes('totally') ||
				outputLower.includes('not at all');
			return hasStrongNegative ? 0.05 : 0.15;
		}

		// Mixed signals - check which appears first
		if (yesMatch && noMatch) {
			const yesIndex = output.toLowerCase().indexOf(yesMatch[0]);
			const noIndex = output.toLowerCase().indexOf(noMatch[0]);
			return yesIndex < noIndex ? 0.6 : 0.4;
		}
	}

	// Generic parsing for unknown models
	// Try numeric extraction first
	const numericMatch = output.match(/([0-9]*\.?[0-9]+)/);
	if (numericMatch) {
		const score = parseFloat(numericMatch[1]);
		if (score >= 0 && score <= 1) return score;
		if (score > 1 && score <= 10) return score / 10;
		if (score > 10 && score <= 100) return score / 100;
	}

	// Keyword-based scoring
	const positiveKeywords = ['relevant', 'yes', 'high', 'strong', 'good', 'match', 'related'];
	const negativeKeywords = ['irrelevant', 'no', 'low', 'weak', 'poor', 'unrelated', 'different'];

	const positiveCount = positiveKeywords.filter(kw => outputLower.includes(kw)).length;
	const negativeCount = negativeKeywords.filter(kw => outputLower.includes(kw)).length;

	if (positiveCount > negativeCount) {
		return 0.5 + (positiveCount * 0.1);
	} else if (negativeCount > positiveCount) {
		return 0.5 - (negativeCount * 0.1);
	}

	// Default to neutral if completely ambiguous
	return 0.5;
}
