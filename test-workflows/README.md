# Test Workflows pour Ollama Reranker

Ce dossier contient des workflows de test pour les nodes Ollama Reranker.

## Workflows Disponibles

### 1. `ollama-reranker-test-workflow.json` ✅

**Test du node : Ollama Reranker Workflow**

**Description :**
Workflow complet pour tester le node workflow chainable.

**Ce qu'il fait :**
1. 📝 Génère 8 documents de test (mix de ML et sujets non-liés)
2. 🔄 Rerank les documents avec la query : "What is machine learning and deep learning?"
3. 📊 Retourne les 3 documents les plus pertinents
4. 📋 Affiche les résultats formatés

**Nodes inclus :**
- Manual Trigger (démarrage)
- Code (génération de documents test)
- **Ollama Reranker Workflow** (le node à tester)
- Set (formatage des résultats)
- Code (affichage des résultats)

**Comment importer :**
1. Dans n8n, cliquez sur menu (☰) → **Import from File**
2. Sélectionnez `ollama-reranker-test-workflow.json`
3. Le workflow s'ouvre automatiquement

**Configuration requise :**
- ✅ Credentials Ollama API configurées (Settings → Credentials)
- ✅ Ollama running sur `http://localhost:11434` (ou votre URL)
- ✅ Modèle `bge-reranker-v2-m3` téléchargé dans Ollama

**Commandes Ollama :**
```bash
# Vérifier qu'Ollama tourne
curl http://localhost:11434/api/tags

# Télécharger le modèle reranker
ollama pull bge-reranker-v2-m3
```

**Résultat attendu :**
Les 3 documents retournés devraient être sur le machine learning/deep learning, classés par pertinence :
1. Deep learning + neural networks (score ~0.85-0.95)
2. Machine learning basics (score ~0.75-0.85)
3. Supervised/NLP/Reinforcement learning (score ~0.60-0.75)

Documents non-pertinents (météo, recette, Paris) devraient être filtrés.

---

## 🧪 Test des Paramètres

Vous pouvez modifier ces paramètres dans le node "Ollama Reranker Workflow" :

### Query (Expression supportée)
```
="What is machine learning and deep learning?"
```
Essayez aussi :
- `="Explain neural networks"`
- `="What is NLP?"`

### Documents Source
- **From Input Items** : Utilise tous les items en entrée
- **From Field** : Extrait depuis `json.documents`
- **From Expression** : `={{ $json.myDocuments }}`

### Model
- `bge-reranker-v2-m3` (recommandé, rapide)
- `dengcao/Qwen3-Reranker-4B:Q5_K_M` (plus précis)

### Top K
- `3` : Retourne top 3 documents
- `5` : Retourne top 5 documents

### Threshold
- `0.3` : Score minimum (0-1)
- `0.5` : Plus strict

### Output Format
- `documents` : Objets complets avec `_rerankScore`
- `simple` : Array simple de contenus

---

## 🔍 Debugging

**Si le workflow échoue :**

1. **Vérifiez les credentials :**
   ```
   Settings → Credentials → Ollama API
   - Host: http://localhost:11434
   - Test connection
   ```

2. **Vérifiez Ollama :**
   ```bash
   # Ollama running ?
   curl http://localhost:11434/api/tags

   # Modèle installé ?
   ollama list | grep bge-reranker
   ```

3. **Vérifiez les logs n8n :**
   ```bash
   # Docker logs
   docker logs deposium-n8n-primary --tail 50

   # Dans le workflow, regardez la console du node "Display Results"
   ```

4. **Erreurs communes :**
   - `Connection refused` : Ollama pas lancé
   - `Model not found` : `ollama pull bge-reranker-v2-m3`
   - `credentials.host undefined` : Credentials non configurées

---

## 📊 Résultats Attendus

### Console Output (node Display Results)
```
=== RERANKING RESULTS ===
Query: What is machine learning and deep learning?
Total documents returned: 3

--- Top Ranked Documents ---

1. Score: 0.923
   Content: Deep learning uses neural networks with multiple layers to process complex patterns in data...
   Topic: deep-learning

2. Score: 0.867
   Content: Machine learning is a subset of artificial intelligence that enables computers to learn...
   Topic: ml-basics

3. Score: 0.754
   Content: Natural language processing (NLP) is a branch of AI that helps computers understand...
   Topic: ml-nlp

========================
```

### JSON Output (node Format Results)
```json
{
  "query": "What is machine learning and deep learning?",
  "total_documents": 3,
  "top_document": "Deep learning uses neural networks...",
  "top_score": 0.923,
  "all_scores": "0.923, 0.867, 0.754"
}
```

---

## 🎯 Workflow Visual

```
┌──────────────┐
│   Manual     │
│   Trigger    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│  Generate    │
│    Test      │  (8 documents)
│  Documents   │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Ollama     │
│  Reranker    │  (rerank to top 3)
│  Workflow    │
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Format     │
│   Results    │  (extract scores)
└──────┬───────┘
       │
       ▼
┌──────────────┐
│   Display    │
│   Results    │  (console output)
└──────────────┘
```

---

## 🚀 Quick Start

1. **Setup Ollama**
   ```bash
   ollama pull bge-reranker-v2-m3
   ```

2. **Configure Credentials in n8n**
   - Settings → Credentials → Add Credential
   - Type: Ollama API
   - Host: http://localhost:11434

3. **Import Workflow**
   - Menu → Import from File
   - Select: `ollama-reranker-test-workflow.json`

4. **Run Test**
   - Click "Test workflow" button
   - Watch results in "Display Results" console

---

## 📝 Notes

- **Version testée** : n8n-nodes-ollama-reranker v1.1.0
- **n8n version** : 1.114.4+
- **Ollama version** : 0.1.0+
- **Model size** : bge-reranker-v2-m3 (~600MB)

---

## 🆘 Support

Si vous rencontrez des problèmes :
1. Vérifiez le README principal : `/README.md`
2. Issues GitHub : https://github.com/theseedship/n8n_reranker/issues
3. Documentation n8n : https://docs.n8n.io/
