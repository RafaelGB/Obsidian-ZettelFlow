/**
 * **Words too common to name a note** (#754 FR-3a) — English and Spanish, folded the way the
 * vocabulary folds a passage (lower case, no accents).
 *
 * A note titled *Time*, *People* or *The end* would be "named" by almost every paragraph of every
 * book, and Alongside would fill with notes that are not near anything. So a name made only of these
 * words never matches, and neither does a single word shorter than five letters. The list is a rule
 * you can read, not a statistic: it is the same for every vault.
 */
export const COMMON_WORDS: ReadonlySet<string> = new Set([
    // English
    "a", "about", "above", "after", "again", "against", "all", "almost", "also", "always", "am", "among", "an", "and",
    "another", "any", "anyone", "anything", "are", "around", "as", "at", "away", "back", "be", "because", "been",
    "before", "being", "below", "best", "better", "between", "big", "both", "but", "by", "can", "cannot", "case",
    "come", "could", "day", "days", "did", "different", "do", "does", "doing", "done", "down", "during", "each",
    "end", "enough", "even", "ever", "every", "everyone", "everything", "fact", "far", "few", "find", "first", "for",
    "from", "further", "get", "give", "go", "good", "great", "had", "has", "have", "having", "he", "her", "here",
    "hers", "herself", "him", "himself", "his", "how", "however", "i", "if", "important", "in", "into", "is", "it",
    "its", "itself", "just", "keep", "kind", "know", "large", "last", "least", "less", "let", "life", "like",
    "little", "long", "look", "made", "make", "making", "man", "many", "may", "me", "might", "more", "most", "much",
    "must", "my", "myself", "need", "never", "new", "next", "no", "nor", "not", "nothing", "now", "of", "off", "often",
    "old", "on", "once", "one", "only", "or", "other", "others", "our", "ours", "ourselves", "out", "over", "own",
    "part", "people", "place", "point", "put", "rather", "really", "right", "said", "same", "say", "says", "see",
    "seem", "seems", "she", "should", "show", "since", "small", "so", "some", "someone", "something", "sometimes",
    "still", "such", "take", "than", "that", "the", "their", "theirs", "them", "themselves", "then", "there",
    "these", "they", "thing", "things", "think", "this", "those", "though", "three", "through", "time", "times",
    "to", "today", "together", "too", "two", "under", "until", "up", "upon", "us", "use", "used", "using", "very",
    "want", "was", "way", "ways", "we", "well", "were", "what", "when", "where", "whether", "which", "while", "who",
    "whole", "whom", "why", "will", "with", "within", "without", "work", "world", "would", "year", "years", "yes",
    "yet", "you", "your", "yours", "yourself", "notes", "note", "chapter", "page", "book", "index", "untitled",
    // Spanish
    "al", "algo", "alguien", "algun", "alguna", "algunas", "alguno", "algunos", "ante", "antes", "aqui", "asi",
    "aun", "aunque", "bien", "bajo", "cada", "casi", "como", "con", "contra", "cosa", "cosas", "cual", "cuales",
    "cuando", "cuanto", "de", "del", "desde", "donde", "dos", "durante", "el", "ella", "ellas", "ello", "ellos",
    "en", "entre", "era", "eran", "eres", "es", "esa", "esas", "ese", "eso", "esos", "esta", "estaba", "estan",
    "estar", "estas", "este", "esto", "estos", "fin", "fue", "fueron", "gente", "gran", "grande", "ha", "hacer",
    "hace", "hacia", "han", "hasta", "hay", "hecho", "la", "las", "le", "les", "lo", "los", "mas", "mayor", "me",
    "mejor", "menos", "mi", "mientras", "mis", "mismo", "misma", "mucho", "muchos", "muy", "nada", "ni", "ninguna",
    "ninguno", "no", "nos", "nosotros", "nuestra", "nuestro", "nueva", "nuevo", "nunca", "o", "otra", "otras",
    "otro", "otros", "para", "parte", "pero", "poco", "por", "porque", "puede", "pueden", "que", "quien", "se",
    "sea", "segun", "ser", "si", "sido", "siempre", "sin", "sino", "sobre", "solo", "son", "su", "sus", "tal",
    "tambien", "tan", "tanto", "te", "tener", "tiempo", "tiene", "tienen", "toda", "todas", "todo", "todos", "tras",
    "tu", "tus", "un", "una", "unas", "uno", "unos", "usted", "va", "vez", "veces", "vida", "y", "ya", "yo",
    "nota", "notas", "capitulo", "pagina", "libro",
]);
