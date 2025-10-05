/*
  Jilb metric (approximation for educational purposes):
  - Absolute complexity A: weighted count of control flow constructs
  - Relative complexity R = A / N, where N – number of statements
  - Max nesting depth: indentation-based + control token stack

  F# tokens considered:
  - if/elif/else
  - match/with | when (pattern guards)
  - for/while
  - function definitions 'let ... =' do not count as control complexity

  Notes: F# is indentation- and keyword-structured; we apply heuristics suitable for learning goals.
*/

(() => {
  const CONTROL_WEIGHTS = [
    { pattern: /\bif\b/g, weight: 1, kind: 'if' },
    { pattern: /\belif\b/g, weight: 1, kind: 'elif' },
    { pattern: /\belse\b/g, weight: 1, kind: 'else' },
    { pattern: /\bmatch\b/g, weight: 2, kind: 'match' },
    { pattern: /\bwith\b/g, weight: 0, kind: 'with' }, // used to begin match-cases section
    { pattern: /\bwhen\b/g, weight: 0.5, kind: 'when' },
    { pattern: /\b\|\s*[_A-Za-z0-9'`]+/g, weight: 1, kind: 'case' },
    { pattern: /\bfor\b/g, weight: 1, kind: 'for' },
    { pattern: /\bwhile\b/g, weight: 1, kind: 'while' },
  ];

  function removeStringsAndComments(source) {
    // Remove block comments (* ... *) and line comments // ...
    let s = source.replace(/\(\*[\s\S]*?\*\)/g, ' ');
    s = s.replace(/\/\/.*$/gm, ' ');
    // Replace string literals with spaces to avoid keyword hits
    s = s.replace(/@?"""[\s\S]*?"""/g, ' '); // triple-quoted
    s = s.replace(/@?"(?:[^"\\]|\\.)*"/g, ' ');
    s = s.replace(/'[^'\\]*(?:\\.[^'\\]*)*'/g, ' ');
    return s;
  }

  function countStatements(source) {
    // Rough count: semicolon ;, newline ends, and keywords 'let', 'do', 'yield', 'return', 'match', 'if', 'for', 'while'
    // Ignore blank and brace-only lines
    const lines = source.split(/\n/);
    let count = 0;
    for (const raw of lines) {
      const line = raw.trim();
      if (!line) continue;
      if (/^\}|^\{|^\)$/.test(line)) continue;
      if (/;\s*$/.test(line)) { count++; continue; }
      if (/\b(let|do|yield|return|match|if|for|while|printf!?)\b/.test(line)) count++;
    }
    return Math.max(1, count); // avoid division by zero
  }

  function analyzeFSharp(source) {
    const pre = removeStringsAndComments(source);
    const lines = pre.split(/\n/);

    let absolute = 0;
    let found = [];
    let depth = 0;
    let maxDepth = 0;

    // Track indentation-based nesting and keyword-based openings
    const indentStack = [];
    let inMatchBlock = false; // becomes true after seeing 'match' until we see a 'with'

    // Stats per operator kind
    const countsByKind = Object.create(null);
    const weightsByKind = CONTROL_WEIGHTS.reduce((acc, r) => { acc[r.kind] = r.weight; return acc; }, {});

    function currentIndent(s) {
      const m = /^(\s*)/.exec(s);
      return m ? m[1].length : 0;
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Adjust indentation-based stack
      const indent = currentIndent(line);
      while (indentStack.length && indentStack[indentStack.length - 1] > indent) {
        indentStack.pop();
        depth = Math.max(0, depth - 1);
      }

      // Detect control tokens and update depth and absolute
      for (const rule of CONTROL_WEIGHTS) {
        if (!rule.pattern.global) {
          // ensure global to iterate multiple hits
          rule.pattern = new RegExp(rule.pattern.source, 'g');
        } else {
          rule.pattern.lastIndex = 0;
        }
        let m;
        while ((m = rule.pattern.exec(trimmed)) !== null) {
          // Match cases in match expression: lines starting with '|' or containing '| case'
          if (rule.kind === 'case') {
            if (!/^\|/.test(trimmed) && !inMatchBlock) continue;
          }
          absolute += rule.weight;
          found.push({ line: i + 1, kind: rule.kind, text: trimmed });
          countsByKind[rule.kind] = (countsByKind[rule.kind] || 0) + 1;

          // Increase depth for opening constructs
          if (['if', 'elif', 'else', 'for', 'while', 'match'].includes(rule.kind)) {
            depth++;
            indentStack.push(indent);
            maxDepth = Math.max(maxDepth, depth);
          }
          if (['case'].includes(rule.kind)) {
            // cases considered at same depth; do not push additional indent
            maxDepth = Math.max(maxDepth, depth);
          }

          if (rule.kind === 'match') {
            inMatchBlock = true;
          }
          if (rule.kind === 'with' && inMatchBlock) {
            // with after match: start of case section (no extra depth)
            maxDepth = Math.max(maxDepth, depth);
            // keep inMatchBlock true for subsequent '|' cases
          }
        }
      }

      // Reset inMatchBlock heuristically when indentation decreases significantly
      if (inMatchBlock && indentStack.length === 0) {
        inMatchBlock = false;
      }
    }

    const statements = countStatements(pre);
    const relative = absolute / statements;
    // Build operator stats array
    const opStats = Object.keys(countsByKind).sort().map(kind => {
      const count = countsByKind[kind] || 0;
      const weight = Number(weightsByKind[kind] ?? 0);
      const contribution = count * weight;
      return { kind, count, weight, contribution };
    });
    return { absolute, relative, depth: maxDepth, statements, found, opStats };
  }

  function renderResults(r) {
    document.getElementById('abs').textContent = r.absolute.toFixed(2);
    document.getElementById('rel').textContent = r.relative.toFixed(3);
    document.getElementById('depth').textContent = String(r.depth);
    document.getElementById('ops').textContent = String(r.statements);
    const lines = r.found.map(x => `${x.line.toString().padStart(4, ' ')}  ${x.kind}  ::  ${x.text}`);
    document.getElementById('found').textContent = lines.join('\n');
    // Render operator table
    const tbody = document.querySelector('#ops-table tbody');
    if (tbody) {
      tbody.innerHTML = '';
      const sorted = (r.opStats || []).slice().sort((a, b) => a.kind.localeCompare(b.kind));
      for (const s of sorted) {
        const tr = document.createElement('tr');
        const tdKind = document.createElement('td'); tdKind.textContent = s.kind;
        const tdCount = document.createElement('td'); tdCount.textContent = String(s.count);
        const tdWeight = document.createElement('td'); tdWeight.textContent = String(s.weight);
        const tdContrib = document.createElement('td'); tdContrib.textContent = s.contribution.toFixed(2);
        tr.appendChild(tdKind); tr.appendChild(tdCount); tr.appendChild(tdWeight); tr.appendChild(tdContrib);
        tbody.appendChild(tr);
      }
    }
  }

  window.runAnalysis = () => {
    const code = document.getElementById('code').value;
    const res = analyzeFSharp(code);
    renderResults(res);
  };
})();



