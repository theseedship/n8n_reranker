import {
	ISupplyDataFunctions,
	SupplyData,
	INodeType,
	INodeTypeDescription,
	NodeConnectionTypes,
	NodeOperationError,
} from 'n8n-workflow';

import { rerankDocuments } from '../shared/reranker-logic';

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
				displayName: 'API Type',
				name: 'apiType',
				type: 'options',
				options: [
					{
						name: 'Ollama Generate API',
						value: 'ollama',
						description: 'Standard Ollama /api/generate endpoint (for BGE, Qwen prompt-based rerankers)',
					},
					{
						name: 'Custom Rerank API',
						value: 'custom',
						description: 'Custom /api/rerank endpoint (for deposium-embeddings-turbov2, etc.)',
					},
				],
				default: 'ollama',
				description: 'Which API endpoint to use for reranking',
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
			if (!model?.trim()) {
				throw new NodeOperationError(
					this.getNode(),
					'Custom model name is required when "Custom Model" is selected',
				);
			}
		}

		const apiType = this.getNodeParameter('apiType', 0, 'ollama') as 'ollama' | 'custom';
		const instruction = this.getNodeParameter('instruction', 0) as string;
		const additionalOptions = this.getNodeParameter('additionalOptions', 0, {}) as {
			includeOriginalScores?: boolean;
			timeout?: number;
			batchSize?: number;
		};

		const timeout = additionalOptions.timeout ?? 30000;
		const batchSize = additionalOptions.batchSize ?? 10;
		const includeOriginalScores = additionalOptions.includeOriginalScores ?? false;

		// Get credentials (n8n's built-in ollamaApi)
		const credentials = await this.getCredentials('ollamaApi');
		if (!credentials?.host) {
			throw new NodeOperationError(
				this.getNode(),
				'Ollama host not configured. Please add Ollama API credentials with a valid host URL.',
			);
		}
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
				if (!query?.trim()) {
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
					// Rerank documents using Ollama or Custom API
					const rerankedDocs = await rerankDocuments(self, {
						ollamaHost,
						model,
						query,
						documents: processedDocs,
						instruction,
						topK,
						threshold,
						batchSize,
						timeout,
						includeOriginalScores,
						apiType,
					});

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
