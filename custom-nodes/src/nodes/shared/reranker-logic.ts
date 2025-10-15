import {
	IExecuteFunctions,
	ISupplyDataFunctions,
	NodeApiError,
	NodeOperationError,
	JsonObject,
} from 'n8n-workflow';

// Type that works with both IExecuteFunctions and ISupplyDataFunctions
type RerankerContext = IExecuteFunctions | ISupplyDataFunctions;

export interface RerankConfig {
	ollamaHost: string;
	model: string;
	query: string;
	documents: any[];
	instruction: string;
	topK: number;
	threshold: number;
	batchSize: number;
	timeout: number;
	includeOriginalScores: boolean;
	apiType?: 'ollama' | 'custom'; // API type selection
}

/**
 * Rerank documents using Ollama reranker model or Custom Rerank API
 */
export async function rerankDocuments(
	context: RerankerContext,
	config: RerankConfig,
): Promise<any[]> {
	const { ollamaHost, model, query, documents, instruction, topK, threshold, batchSize, timeout, includeOriginalScores, apiType = 'ollama' } = config;

	// Use Custom Rerank API if specified
	if (apiType === 'custom') {
		return await rerankWithCustomAPI(context, config);
	}

	// Otherwise use Ollama Generate API (original logic)
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
 * Rerank documents using Custom Rerank API (/api/rerank endpoint)
 * This is for services like deposium-embeddings-turbov2 that implement
 * a custom /api/rerank endpoint with direct cosine similarity scoring
 */
async function rerankWithCustomAPI(
	context: RerankerContext,
	config: RerankConfig,
): Promise<any[]> {
	const { ollamaHost, model, query, documents, topK, threshold, timeout, includeOriginalScores } = config;

	try {
		// Extract document content as strings
		const documentStrings = documents.map(doc => doc.pageContent || JSON.stringify(doc));

		// Call /api/rerank endpoint
		const response = await context.helpers.httpRequest({
			method: 'POST',
			url: `${ollamaHost}/api/rerank`,
			headers: {
				'Content-Type': 'application/json',
				Accept: 'application/json',
			},
			body: {
				model,
				query,
				documents: documentStrings,
				top_k: topK, // Custom API handles top_k filtering
			},
			json: true,
			timeout,
		});

		// Parse response: { model: "...", results: [{index, document, relevance_score}] }
		if (!response?.results || !Array.isArray(response.results)) {
			throw new NodeApiError(context.getNode(), response as JsonObject, {
				message: 'Invalid response from Custom Rerank API',
				description: `Expected {results: [...]} but got: ${JSON.stringify(response)}`,
			});
		}

		// Filter by threshold and map to our format
		const filteredResults = response.results
			.filter((r: any) => r.relevance_score >= threshold)
			.map((result: any) => {
				const originalDoc = documents[result.index];
				const rerankedDoc: any = {
					...originalDoc,
					_rerankScore: result.relevance_score,
					_originalIndex: result.index,
				};

				if (includeOriginalScores && originalDoc._originalScore !== undefined) {
					rerankedDoc._originalScore = originalDoc._originalScore;
				}

				return rerankedDoc;
			});

		return filteredResults;

	} catch (error: any) {
		if (error?.response?.statusCode === 404) {
			throw new NodeApiError(context.getNode(), error, {
				message: 'Custom Rerank API endpoint not found',
				description: `The /api/rerank endpoint was not found at ${ollamaHost}.\nMake sure you're using a service that supports this endpoint (like deposium-embeddings-turbov2).`,
			});
		}

		if (error?.response?.body) {
			throw new NodeApiError(context.getNode(), error, {
				message: `Custom Rerank API Error (${error.response.statusCode})`,
				description: `Endpoint: ${ollamaHost}/api/rerank\nModel: ${model}\nResponse: ${JSON.stringify(error.response.body, null, 2)}`,
			});
		}

		throw new NodeApiError(context.getNode(), error as JsonObject, {
			message: 'Custom Rerank API request failed',
			description: `Endpoint: ${ollamaHost}/api/rerank\nModel: ${model}\nError: ${error.message}`,
		});
	}
}

/**
 * Score a single document against the query using Ollama reranker model with retry logic
 */
async function scoreDocument(
	context: RerankerContext,
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
 * Parse BGE model response to extract relevance score
 */
function parseBGEScore(output: string, outputLower: string): number | null {
	// Try to extract floating point number
	const scoreRegex = /(\d*\.?\d+)/;
	const scoreMatch = scoreRegex.exec(output);
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

	return null;
}

/**
 * Parse Qwen model response to extract relevance score
 */
function parseQwenScore(output: string, outputLower: string): number | null {
	// Look for explicit yes/no in the response
	const yesRegex = /\b(yes|relevant|positive|match)\b/;
	const noRegex = /\b(no|irrelevant|negative|not\s+relevant)\b/;
	const yesMatch = yesRegex.exec(outputLower);
	const noMatch = noRegex.exec(outputLower);

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

	return null;
}

/**
 * Parse generic model response with fallback logic
 */
function parseGenericScore(output: string, outputLower: string): number {
	// Try numeric extraction first
	const numericRegex = /(\d*\.?\d+)/;
	const numericMatch = numericRegex.exec(output);
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

/**
 * Parse Ollama reranker response to extract relevance score
 * Uses model-specific parsing logic for better accuracy
 */
function parseRerankerResponse(model: string, response: any): number {
	if (!response?.response) {
		return 0.0;
	}

	const output = response.response as string;
	const outputLower = output.toLowerCase();
	const isBGE = model.toLowerCase().includes('bge');
	const isQwen = model.toLowerCase().includes('qwen');

	// Try model-specific parsers
	if (isBGE) {
		const score = parseBGEScore(output, outputLower);
		if (score !== null) return score;
	}

	if (isQwen) {
		const score = parseQwenScore(output, outputLower);
		if (score !== null) return score;
	}

	// Fallback to generic parsing
	return parseGenericScore(output, outputLower);
}
