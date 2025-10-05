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
    { pattern: /\belse\b/g, weight: 0, kind: 'else' }, // else does not increase CL
    { pattern: /\bmatch\b/g, weight: 0, kind: 'match' }, // CL from match is (cases-1)
    { pattern: /\bwith\b/g, weight: 0, kind: 'with' },
    { pattern: /\bwhen\b/g, weight: 0, kind: 'when' },
    { pattern: /\b\|\s*[_A-Za-z0-9'`]+/g, weight: 0, kind: 'case' }, // counted per block
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
    let inMatchBlock = false; // true after 'match', until cases section ends
    let currentMatchCases = 0;

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

      // Finalize a previous match block if cases ended
      if (inMatchBlock && !/^\|/.test(trimmed)) {
        if (currentMatchCases > 0) {
          absolute += Math.max(0, currentMatchCases - 1);
        }
        inMatchBlock = false;
        currentMatchCases = 0;
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
          absolute += rule.weight; // most weights are 0 except if/elif/for/while
          found.push({ line: i + 1, kind: rule.kind, text: trimmed });
          countsByKind[rule.kind] = (countsByKind[rule.kind] || 0) + 1;

          // Increase depth for opening constructs (elif/else do not open a new block)
          if (['if', 'for', 'while', 'match'].includes(rule.kind)) {
            depth++;
            indentStack.push(indent);
            maxDepth = Math.max(maxDepth, depth);
          }
          if (rule.kind === 'case') {
            // count cases for current match block; do not change depth
            if (inMatchBlock) currentMatchCases++;
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

      // Line-based case detection to catch all F# patterns (e.g., "| 6 | 0 ->" or "| _ ->")
      if (inMatchBlock && /^\|/.test(trimmed)) {
        currentMatchCases++;
        countsByKind['case'] = (countsByKind['case'] || 0) + 1;
        found.push({ line: i + 1, kind: 'case', text: trimmed });
        maxDepth = Math.max(maxDepth, depth);
      }

      // Reset inMatchBlock heuristically when indentation decreases significantly
      if (inMatchBlock && indentStack.length === 0) {
        if (currentMatchCases > 0) {
          absolute += Math.max(0, currentMatchCases - 1);
        }
        inMatchBlock = false;
        currentMatchCases = 0;
      }
    }

    const statements = countStatements(pre);
    // Halstead-like operators (ported tokenizer/classifier)
    const halstead = halsteadOperators(source);
    const operatorN = (halstead.operator_frequencies || []).reduce((s, kv) => s + (Array.isArray(kv) ? kv[1] : 0), 0);
    const relative = absolute / Math.max(1, operatorN);
    // Build operator stats array
    const opStats = Object.keys(countsByKind).sort().map(kind => {
      const count = countsByKind[kind] || 0;
      const weight = Number(weightsByKind[kind] ?? 0);
      const contribution = count * weight;
      return { kind, count, weight, contribution };
    });
    return { absolute, relative, depth: maxDepth, statements, found, opStats, halstead, operatorN };
  }

  function renderResults(r) {
    document.getElementById('abs').textContent = r.absolute.toFixed(2);
    document.getElementById('rel').textContent = r.relative.toFixed(3);
    document.getElementById('depth').textContent = String(r.depth);
    document.getElementById('ops').textContent = String(r.operatorN || 0);
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

    // Render Halstead operators table
    const tbodyH = document.querySelector('#halstead-ops tbody');
    if (tbodyH) {
      tbodyH.innerHTML = '';
      const list = (r.halstead && r.halstead.operator_frequencies) ? r.halstead.operator_frequencies : [];
      for (const [tok, freq] of list) {
        const tr = document.createElement('tr');
        const tdTok = document.createElement('td'); tdTok.textContent = tok;
        const tdFreq = document.createElement('td'); tdFreq.textContent = String(freq);
        tr.appendChild(tdTok); tr.appendChild(tdFreq);
        tbodyH.appendChild(tr);
      }
    }
  }

  window.runAnalysis = () => {
    const code = document.getElementById('code').value;
    const res = analyzeFSharp(code);
    renderResults(res);
  };
})();

// ================= Halstead-like operator detection (ported from provided algorithm) =================
(function(){
  const FSHARP_KEYWORDS = new Set([
    'let','in','do','done','rec','mutable','if','then','elif','else',
    'match','with','when','function','fun','return','yield',
    'for','to','downto','while','try','finally','raise','exception',
    'module','open','namespace','type','member','inherit','interface',
    'and','or','not','bind','use','new','class','struct','end'
  ]);

  const FSHARP_MULTI_CHAR_OPERATORS = [
    '>>=','<=','>=','<>','<-',':=','|>','<|','>>','<<','::',
    '**','&&','||','&&&','|||','^^^','~~~','<<<','>>>','@'
  ];
  const FSHARP_SINGLE_CHAR_OPERATORS = Array.from(new Set([
    '+','-','*','/','%','=','<','>','.',
    ':','|','&','^','~','?','!','[',']','{','}','(',')'
  ]));

  const RE_BLOCK_COMMENT = /\(\*[\s\S]*?\*\)/g;
  const RE_LINE_COMMENT = /\/\/.*?(?=\n|$)/g;
  const RE_STRING = /"(?:[^"\\]|\\.)*"/g;
  const RE_CHAR = /'(?:[^'\\]|\\.)'/g;
  const RE_NUMBER = /\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/;
  const RE_IDENTIFIER = /\b[_A-Za-z][A-Za-z0-9_']*\b/;
  const RE_PRINTF_SPEC = /%(?:\d+\$)?(?:\.\d+)?([a-zA-Z])/g;

  function stripComments(s){
    return s.replace(RE_BLOCK_COMMENT, ' ').replace(RE_LINE_COMMENT, ' ');
  }

  function extractAndMaskLiterals(source){
    const literals = [];
    function store(m){ literals.push(m[0]); return ` __LIT${literals.length-1}__ `; }
    let masked = source.replace(RE_STRING, (m)=>store([m]));
    masked = masked.replace(RE_CHAR, (m)=>store([m]));
    return { masked, literals };
  }

  function restoreLiteral(token, literals){
    if (token.startsWith('__LIT') && token.endsWith('__')){
      const idx = parseInt(token.slice(5,-2),10);
      return literals[idx];
    }
    return token;
  }

  function buildTokenPattern(){
    const multi = FSHARP_MULTI_CHAR_OPERATORS.slice().sort((a,b)=>b.length-a.length).map(x=>x.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')).join('|');
    const single = FSHARP_SINGLE_CHAR_OPERATORS.map(x=>x.replace(/[-/\\^$*+?.()|[\]{}]/g,'\\$&')).join('|');
    const pat = new RegExp(
      `\\s+|(${multi})|(${single})|(${RE_NUMBER.source})|(${RE_IDENTIFIER.source})|(__LIT\\d+__)`,
      'gy'
    );
    return pat;
  }

  function tokenize(src){
    const code = stripComments(src);
    const { masked, literals } = extractAndMaskLiterals(code);
    const tokenPattern = buildTokenPattern();
    const tokens = [];
    let pos = 0;
    while (pos < masked.length){
      tokenPattern.lastIndex = pos;
      const m = tokenPattern.exec(masked);
      if (!m || m.index !== pos){ pos += 1; continue; }
      const tok = m[0];
      pos = tokenPattern.lastIndex;
      if (/^\s+$/.test(tok)) continue;
      tokens.push(tok);
    }
    // restore literals
    for (let i=0;i<tokens.length;i++){
      if (tokens[i].startsWith('__LIT') && tokens[i].endsWith('__')){
        tokens[i] = restoreLiteral(tokens[i], literals);
      }
    }
    return tokens;
  }

  function isIdentifier(s){ return RE_IDENTIFIER.test(s) && s.length === (s.match(RE_IDENTIFIER)||[''])[0].length; }

  function halsteadClassify(tokens){
    const operatorCounts = new Map();
    const multiOps = new Set(FSHARP_MULTI_CHAR_OPERATORS);
    const singleOps = new Set(FSHARP_SINGLE_CHAR_OPERATORS);

    const processed = new Set();

    // detect [<EntryPoint>]
    for (let i=0;i<tokens.length-2;i++){
      if (tokens[i] === '<' && tokens[i+1] === 'EntryPoint' && tokens[i+2] === '>'){
        operatorCounts.set('[<EntryPoint>]', (operatorCounts.get('[<EntryPoint>]')||0)+1);
        processed.add(i); processed.add(i+1); processed.add(i+2);
      }
    }

    let i=0; let suppressMatchMarkersWindow = 0;
    while (i < tokens.length){
      if (processed.has(i)){ i++; continue; }
      const tok = tokens[i];
      const lower = tok.toLowerCase();

      // for-in-do / for-to-do
      if (lower === 'for'){
        let foundIn=false, foundTo=false, foundDo=false;
        for (let j=i+1; j<Math.min(tokens.length, i+10); j++){
          const t=tokens[j].toLowerCase();
          if (t==='in') foundIn=true;
          else if (t==='to') foundTo=true;
          else if (t==='do' && (foundIn||foundTo)){ foundDo=true; break; }
        }
        if (foundIn && foundDo){ operatorCounts.set('for-in-do',(operatorCounts.get('for-in-do')||0)+1); i++; continue; }
        if (foundTo && foundDo){ operatorCounts.set('for-to-do',(operatorCounts.get('for-to-do')||0)+1); i++; continue; }
      }

      // match-with
      if (lower === 'match'){
        let foundWith=false;
        for (let j=i+1; j<Math.min(tokens.length, i+10); j++){
          if (tokens[j].toLowerCase()==='with'){ foundWith=true; break; }
        }
        if (foundWith){ operatorCounts.set('match-with',(operatorCounts.get('match-with')||0)+1); suppressMatchMarkersWindow=50; i++; continue; }
      }

      // while-do
      if (lower === 'while'){
        let foundDo=false; for (let j=i+1;j<Math.min(tokens.length,i+10);j++){ if (tokens[j].toLowerCase()==='do'){ foundDo=true; break; } }
        if (foundDo){ operatorCounts.set('while-do',(operatorCounts.get('while-do')||0)+1); i++; continue; }
      }

      // if-then-elif-else
      if (lower === 'if'){
        let foundThen=false; for (let j=i+1;j<Math.min(tokens.length,i+50);j++){ if (tokens[j].toLowerCase()==='then'){ foundThen=true; break; } }
        if (foundThen){ operatorCounts.set('if-then-elif-else',(operatorCounts.get('if-then-elif-else')||0)+1); i++; continue; }
      }

      // when ->
      if (lower === 'when'){
        let foundArrow=false; for (let j=i+1;j<Math.min(tokens.length,i+10);j++){ if (tokens[j]==='-' && tokens[j+1]==='>'){ foundArrow=true; break; } }
        if (foundArrow){ operatorCounts.set('when->',(operatorCounts.get('when->')||0)+1); i++; continue; }
      }

      // fun ->
      if (lower === 'fun'){
        let foundArrow=false; for (let j=i+1;j<Math.min(tokens.length,i+5);j++){ if (tokens[j]==='-' && tokens[j+1]==='>'){ foundArrow=true; break; } }
        if (foundArrow){ operatorCounts.set('fun->',(operatorCounts.get('fun->')||0)+1); i++; continue; }
      }

      // range '..' tokenized as '.' '.'
      if (tok==='.' && tokens[i+1]==='.'){
        operatorCounts.set('..', (operatorCounts.get('..')||0)+1); i+=2; continue; }

      // arrow '->'
      if (tok==='-' && tokens[i+1]==='>'){
        if (!(suppressMatchMarkersWindow>0)){
          operatorCounts.set('->', (operatorCounts.get('->')||0)+1);
        }
        i+=2; continue;
      }

      // multi/single char operators
      if (multiOps.has(tok) || singleOps.has(tok)){
        if (!(suppressMatchMarkersWindow>0 && (tok==='|' || tok==='->'))){
          operatorCounts.set(tok, (operatorCounts.get(tok)||0)+1);
        }
        i++; continue;
      }

      // identifiers and keywords
      if (isIdentifier(tok)){
        if (FSHARP_KEYWORDS.has(lower)){
          if (!new Set(['for','in','do','match','with','while','if','then','elif','else','try','finally','to','fun','when']).has(lower)){
            operatorCounts.set(lower,(operatorCounts.get(lower)||0)+1);
          }
        } else {
          // function calls like name(
          if (tokens[i+1]==='('){ operatorCounts.set(tok,(operatorCounts.get(tok)||0)+1); i++; continue; }
        }
        i++; continue;
      }

      i++;
      if (suppressMatchMarkersWindow>0) suppressMatchMarkersWindow--;
    }

    // Convert to sorted array by freq desc then lexicographically
    const arr = Array.from(operatorCounts.entries()).sort((a,b)=> b[1]-a[1] || (a[0]<b[0]?-1:1));
    return arr;
  }

  window.halsteadOperators = function(source){
    const tokens = tokenize(source);
    const operator_frequencies = halsteadClassify(tokens);
    return { operator_frequencies };
  };
})();