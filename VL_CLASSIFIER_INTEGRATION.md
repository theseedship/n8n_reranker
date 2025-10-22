# VL Classifier Integration Guide

## Version 1.4.0 - New Features

This version adds support for Vision-Language (VL) classification servers like `deposium_embeddings-turbov2`, enabling document complexity analysis before reranking.

## Features

### 1. **VL Classifier API Support**
- New API type: `vl-classifier` for servers with `/api/classify` endpoint
- Document complexity classification (LOW/HIGH)
- Vision-Language model support (ResNet18 ONNX INT8)
- Automatic server capability detection via `/api/status`

### 2. **Auto-Detection Mode**
- New "Auto-Detect" option automatically identifies server type:
  - VL Classifier servers (with `/api/status` and `/api/classify`)
  - Ollama servers (with `/api/tags`)
  - Custom rerank servers (with `/api/rerank`)
  - Default fallback to Ollama

### 3. **Classification Strategies**
Three strategies for using classification results:

#### **Metadata Only** (default)
- Adds `_complexityClass` and `_complexityConfidence` to documents
- No filtering, all documents are reranked
- Useful for downstream processing

#### **Filter Documents**
- Filters documents based on complexity before reranking
- Options: LOW only, HIGH only, or both
- Reduces reranking workload for better performance

#### **Filter + Metadata**
- Combines filtering with metadata enrichment
- Best for complex workflows needing both capabilities

## Configuration

### API Type Selection
```javascript
{
  apiType: 'vl-classifier',  // or 'auto' for auto-detection
  enableClassification: true,
  classificationStrategy: 'metadata',  // 'filter' or 'both'
  filterComplexity: 'both'  // 'LOW', 'HIGH', or 'both'
}
```

### Server Endpoints

#### Required Endpoints for VL Classifier
- `GET /api/status` - Server health and capabilities
- `POST /api/classify` - Document classification

#### Status Response Format
```json
{
  "status": "healthy",
  "models_loaded": ["ResNet18-ONNX"],
  "vram_usage": 2.5,
  "has_classifier": true,
  "has_reranker": false,
  "version": "1.0.0"
}
```

#### Classification Request Format
```json
{
  "text": "Document content here",
  "image": "base64_image_data"  // Optional for VL models
}
```

#### Classification Response Format
```json
{
  "complexity": "HIGH",  // or "LOW"
  "confidence": 0.95,
  "processing_time": 0.05,
  "model": "ResNet18-ONNX"
}
```

## Usage Examples

### 1. Basic VL Classification with Metadata
```javascript
// In n8n workflow node
{
  "API Type": "VL Classifier + Reranker",
  "Enable VL Classification": true,
  "Classification Strategy": "Add Metadata Only",
  "Filter Complexity": "Both"
}
```

### 2. Filter High-Complexity Documents for VLM Processing
```javascript
{
  "API Type": "VL Classifier + Reranker",
  "Enable VL Classification": true,
  "Classification Strategy": "Filter Documents",
  "Filter Complexity": "High Complexity Only"
}
```

### 3. Auto-Detect Server Type
```javascript
{
  "API Type": "Auto-Detect"
  // Other settings will adapt based on detected server
}
```

## Benefits

1. **Performance Optimization**
   - Pre-filter documents to reduce reranking load
   - ResNet18 ONNX INT8 model is only 11MB
   - Fast classification (~50ms per document)

2. **Intelligent Document Routing**
   - Route LOW complexity to OCR
   - Route HIGH complexity to VLM
   - Optimize processing costs

3. **Flexible Integration**
   - Works with existing Ollama credentials
   - Backward compatible with all existing configurations
   - Graceful fallback on classification failures

## Server Implementation

If you're implementing a VL classifier server, ensure:

1. **Implement `/api/status` endpoint**:
   - Return `has_classifier: true` for detection
   - Include model and VRAM information

2. **Implement `/api/classify` endpoint**:
   - Accept JSON with `text` field
   - Optional `image` field for vision models
   - Return `complexity` as "LOW" or "HIGH"

3. **Optional `/api/rerank` endpoint**:
   - If available, set `has_reranker: true` in status
   - Will be used after classification if present

## Error Handling

- Classification failures default to LOW complexity
- Documents are never lost due to classification errors
- Detailed error logging for debugging
- Automatic retries with exponential backoff

## Performance Considerations

- Classification runs in parallel for all documents
- Batch size configurable (default: 10)
- Timeout configurable (default: 30s)
- VRAM monitoring via `/api/status`

## Testing

Run the test suite to verify integration:
```bash
npm test -- reranker-logic.test.ts
```

## Migration Guide

### From v1.3.x to v1.4.0
- No breaking changes
- Existing configurations continue to work
- New features are opt-in via API Type selection
- Consider enabling auto-detection for flexibility

## Troubleshooting

### Server Not Detected as VL Classifier
- Verify `/api/status` returns `has_classifier: true`
- Check server logs for endpoint availability
- Use manual "VL Classifier + Reranker" selection

### Classification Always Returns LOW
- Check server logs for errors
- Verify model is loaded (check `/api/status`)
- Test `/api/classify` endpoint directly

### Performance Issues
- Reduce batch size for concurrent processing
- Increase timeout for slow networks
- Monitor VRAM usage via `/api/status`