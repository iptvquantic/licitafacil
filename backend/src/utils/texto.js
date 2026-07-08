const STOPWORDS = new Set(['de','da','do','das','dos','em','na','no','nas','nos','a','o','as','os','e','que','um','uma','para','com','por','se','ao','ou','mas','mais','como','seu','sua','seus','suas','este','esta','estes','estas','esse','essa','isso','ele','ela','eles','elas','foi','ser','ter','nao','nos','me','te','lhe','quando','onde']);

function tokenizar(texto) {
  return texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(function(t){return t.length>2&&!STOPWORDS.has(t);});
}

function gerarBigramas(tokens) {
  var b=[];
  for(var i=0;i<tokens.length-1;i++) b.push(tokens[i]+'_'+tokens[i+1]);
  return b;
}

function calcularTFIDF(texto, corpus) {
  var tokens=tokenizar(texto), bigramas=gerarBigramas(tokens), todas=tokens.concat(bigramas);
  var tf={};
  for(var i=0;i<todas.length;i++) tf[todas[i]]=(tf[todas[i]]||0)+1;
  for(var k in tf) tf[k]=tf[k]/todas.length;
  var idf={};
  for(var term in tf){var df=corpus.filter(function(d){return d.includes(term);}).length;idf[term]=Math.log((corpus.length+1)/(df+1))+1;}
  var tfidf={};
  for(var t2 in tf) tfidf[t2]=tf[t2]*(idf[t2]||1);
  return tfidf;
}

function cosineSimilarity(vec1,vec2) {
  var keys=new Set(Object.keys(vec1).concat(Object.keys(vec2)));
  var dot=0,n1=0,n2=0;
  keys.forEach(function(k){var v1=vec1[k]||0,v2=vec2[k]||0;dot+=v1*v2;n1+=v1*v1;n2+=v2*v2;});
  return n1&&n2?dot/(Math.sqrt(n1)*Math.sqrt(n2)):0;
}

module.exports={tokenizar,gerarBigramas,calcularTFIDF,cosineSimilarity};
