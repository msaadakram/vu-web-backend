const slugify = require('../utils/slugify');
const { chatCompletion } = require('../config/doai');
const BlogPost = require('../models/BlogPost');
const Resource = require('../models/Resource');

const SYSTEM_PROMPT = `You are an expert SEO content strategist and academic copywriter for Virtual University of Pakistan (VU). Your role is to create search-engine-optimized, authoritative, and student-focused blog articles that rank on Google.

Every article MUST:
- Position Virtual University of Pakistan (VU) as the authoritative educational platform for the topic
- Naturally include "Virtual University of Pakistan", "VU", or "VirtualU" at least 2-3 times throughout the article body
- Be written for Pakistani university students (mention local academic context, exam patterns, semester systems)
- Include the course code (if provided) prominently in the content
- Target high-intent educational keywords that Pakistani students search for (e.g. "CS301 past papers", "what is data structures", "calculus exam tips")
- Follow Google's E-E-A-T guidelines (Experience, Expertise, Authoritativeness, Trustworthiness)

Return ONLY a valid JSON object (no markdown fences, no extra text) matching this exact schema:

{
  "title": "string — SEO title (max 65 chars) that includes primary keyword and 'Virtual University' or 'VU' naturally. Example: 'CS301 Data Structures Guide | Virtual University Pakistan'",
  "metaTitle": "string — <title> tag (max 60 chars) optimized for click-through. Example: 'CS301 Data Structures | Virtual University Study Guide'",
  "metaDescription": "string — 150–160 chars meta description with primary keyword + call-to-action. Must include 'Virtual University of Pakistan' or 'VU'.",
  "excerpt": "string — compelling 1-2 sentence summary with keyword for card previews and search snippets",
  "slugHint": "string — suggested URL slug (lowercase, hyphens, e.g. 'cs301-data-structures-guide-vu')",
  "category": "string — one of: Computer Science, Mathematics, Business, Physics, Chemistry, Economics, English, General",
  "tags": ["string","string","string"] — 3-5 SEO tags including 'Virtual University of Pakistan'",
  "keywords": ["string","string","string"] — 3-5 primary keywords for SEO meta, must include the course code and 'Virtual University Pakistan'",
  "readTime": "string — accurate reading time estimate, e.g. '8 min read'",
  "sections": [
    { "heading": "string — H2 section title with keyword where natural", "body": "string — 2-4 paragraphs of rich, original, student-focused prose with specific examples. Each paragraph 3-6 sentences. Plain text only." }
  ],
  "faq": [
    { "question": "string — question students actually Google", "answer": "string — detailed answer referencing VU resources and exam context" }
  ]
}

SEO REQUIREMENTS:
- Write 6-9 sections minimum, each with substantial content (2-4 paragraphs)
- Keyword density: primary keyword appears 3-5 times, secondary keywords 2-3 times
- Each section must provide real educational value — not fluff
- Include specific concepts, topics, and frameworks relevant to the course
- FAQ items must target actual student questions with "Virtual University" context
- metaDescription MUST include a call-to-action like "Learn more at Virtual University of Pakistan"
- DO NOT use markdown formatting anywhere — plain text only
- Never use placeholder text — every sentence must be original and substantive
- The article should be 1500-2500 words total`;

const NEWS_SYSTEM_PROMPT = `You are an expert content writer and journalist for Virtual University of Pakistan (VU). Your role is to create informative, engaging, and well-researched news articles that educate and inform students.

Every article MUST:
- Be written for Pakistani university students
- Provide real educational value — not fluff
- Be factual, clear, and student-focused
- Include specific concepts, frameworks, or information relevant to the topic
- Follow high journalistic standards

Return ONLY a valid JSON object (no markdown fences, no extra text) matching this exact schema:

{
  "title": "string — compelling title (max 80 chars)",
  "metaTitle": "string — <title> tag (max 60 chars) optimized for click-through",
  "metaDescription": "string — 150–160 chars meta description",
  "excerpt": "string — compelling 1-2 sentence summary for card previews",
  "slugHint": "string — suggested URL slug (lowercase, hyphens)",
  "category": "string — one of: News, Announcements, Events, Academics, Research, General",
  "tags": ["string","string","string"] — 3-5 relevant tags",
  "keywords": ["string","string","string"] — 3-5 primary keywords for SEO meta",
  "readTime": "string — accurate reading time estimate, e.g. '5 min read'",
  "sections": [
    { "heading": "string — H2 section title", "body": "string — 2-4 paragraphs. Each paragraph 3-6 sentences. Plain text only." }
  ],
  "faq": [
    { "question": "string — question students might ask", "answer": "string — detailed answer" }
  ]
}

REQUIREMENTS:
- Write 4-7 sections minimum
- Each section must provide real value — not fluff
- FAQ items must target actual student questions
- DO NOT use markdown formatting — plain text only
- The article should be 800-2000 words total`;


/**
 * Generate an SEO blog post for a given resource using the DO AI inference API.
 * @param {string} blogPostId - Mongo _id of the BlogPost doc to populate
 * @param {object} resource - the Resource document (lean is fine)
 */
async function generate(blogPostId, resource) {
  try {
    const userMessage = buildUserMessage(resource);

    const result = await chatCompletion({
      messages: [
        { role: 'user', content: SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      jsonMode: true,
      temperature: 0.7,
    });

    const slug = slugify(result.slugHint || result.title || resource.title);
    const uniqueSlug = await ensureUniqueSlug(slug);

    const resourceRef = resource._id || resource.id;

    const updates = {
      title: result.title || resource.title,
      slug: uniqueSlug,
      excerpt: result.excerpt || '',
      category: result.category || 'General',
      tags: result.tags || [],
      keywords: result.keywords || [],
      metaTitle: result.metaTitle || result.title || resource.title,
      metaDescription: result.metaDescription || '',
      readTime: result.readTime || '5 min read',
      sections: result.sections || [],
      faq: result.faq || [],
      aiModel: process.env.DOAI_MODEL || 'alibaba-qwen3-32b',
      status: 'published',
      errorMessage: '',
    };

    await BlogPost.findByIdAndUpdate(blogPostId, updates);

    // Link back from Resource
    await Resource.findByIdAndUpdate(resourceRef, { blog: blogPostId });

    return slug;
  } catch (err) {
    const msg = err.message || 'Unknown error during blog generation';
    await BlogPost.findByIdAndUpdate(blogPostId, {
      status: 'failed',
      errorMessage: msg.slice(0, 500),
    }).catch(() => {});
    throw err;
  }
}

/**
 * Generate a standalone news/article (no resource required).
 * @param {string} blogPostId - Mongo _id of the BlogPost doc to populate
 * @param {object} fields - { title, description?, category?, tags? }
 */
async function generateFromFields(blogPostId, fields) {
  try {
    const userMessage = [
      `Title: ${fields.title}`,
      fields.description ? `Description: ${fields.description}` : '',
      fields.category ? `Category: ${fields.category}` : '',
      fields.tags?.length ? `Tags: ${fields.tags.join(', ')}` : '',
      '',
      'Write a comprehensive, informative news/article for Virtual University of Pakistan (VU) students about this topic.',
      'The article should be engaging, well-structured, and provide real educational value.',
    ].filter(Boolean).join('\n');

    const result = await chatCompletion({
      messages: [
        { role: 'user', content: NEWS_SYSTEM_PROMPT },
        { role: 'user', content: userMessage },
      ],
      jsonMode: true,
      temperature: 0.7,
    });

    const slug = slugify(result.slugHint || result.title || fields.title);
    const uniqueSlug = await ensureUniqueSlug(slug);

    const updates = {
      title: result.title || fields.title,
      slug: uniqueSlug,
      excerpt: result.excerpt || '',
      category: result.category || fields.category || 'General',
      tags: result.tags || fields.tags || [],
      keywords: result.keywords || [],
      metaTitle: result.metaTitle || result.title || fields.title,
      metaDescription: result.metaDescription || '',
      readTime: result.readTime || '5 min read',
      sections: result.sections || [],
      faq: result.faq || [],
      aiModel: process.env.DOAI_MODEL || 'alibaba-qwen3-32b',
      status: 'published',
      errorMessage: '',
    };

    await BlogPost.findByIdAndUpdate(blogPostId, updates);
    return slug;
  } catch (err) {
    const msg = err.message || 'Unknown error during news generation';
    await BlogPost.findByIdAndUpdate(blogPostId, {
      status: 'failed',
      errorMessage: msg.slice(0, 500),
    }).catch(() => {});
    throw err;
  }
}

function buildUserMessage(resource) {
  const lines = [];
  if (resource.title) lines.push(`Resource Title: ${resource.title}`);
  if (resource.course) lines.push(`Course Code: ${resource.course}`);
  if (resource.type) lines.push(`Resource Type: ${resource.type}`);
  if (resource.semester) lines.push(`Semester: ${resource.semester}`);
  if (resource.description) lines.push(`Description from uploader: ${resource.description}`);
  lines.push('');
  lines.push('Write a comprehensive, SEO-optimized academic article for Virtual University of Pakistan (VU) students about this course topic. The article must be authoritative, highly detailed, and structured to rank well on Google for Pakistani student search queries.');
  lines.push('');
  lines.push('The article should help VU students understand the subject, prepare for exams, and succeed in their coursework. Naturally mention Virtual University of Pakistan and VU throughout the article as the educational context.');

  if (resource.course) {
    lines.push('');
    lines.push(`The course code "${resource.course}" should be featured in the title, meta data, and body as a primary keyword. Pakistani students frequently search for this course code with terms like "past papers", "handouts", "assignments", and "exam preparation".`);
  }

  if (resource.description) {
    lines.push('');
    lines.push(`The uploader provided this context: "${resource.description}". Incorporate this into the article naturally to add specificity and value.`);
  }

  return lines.join('\n');
}

async function ensureUniqueSlug(baseSlug) {
  const existing = await BlogPost.findOne({ slug: baseSlug }).lean();
  if (!existing) return baseSlug;

  // Append a short numeric suffix
  for (let i = 1; i < 100; i++) {
    const candidate = `${baseSlug}-${i}`;
    const exists = await BlogPost.findOne({ slug: candidate }).lean();
    if (!exists) return candidate;
  }

  return `${baseSlug}-${Date.now()}`;
}

/**
 * Use AI to classify what type of resource this is (assignment, past-paper, handout, notes, other).
 * Returns one of the RESOURCE_TYPES values.
 */
async function classifyResource({ title, description, originalName, course }) {
  try {
    const prompt = `Given this academic resource info, classify it into exactly one of these categories: assignment, past-paper, handout, notes, or other.

Resource info:
- File name: ${originalName || ''}
- Title: ${title || ''}
- Course: ${course || ''}
- Description: ${description || ''}

Return ONLY a single word — the category name. No punctuation, no explanation.`;

    const result = await chatCompletion({
      messages: [{ role: 'user', content: prompt }],
      jsonMode: false,
      temperature: 0,
      maxTokens: 20,
    });

    const cleaned = result.trim().toLowerCase().replace(/[^a-z-]/g, '');
    const valid = ['assignment', 'past-paper', 'handout', 'notes', 'other'];
    if (valid.includes(cleaned)) {
      console.log(`[Classify] "${title || originalName}" → ${cleaned}`);
      return cleaned;
    }
    console.log(`[Classify] "${title || originalName}" unrecognized "${cleaned}", falling back to "other"`);
    return 'other';
  } catch (err) {
    console.error(`[Classify] Error classifying resource: ${err.message}`);
    return 'other'; // fallback
  }
}

module.exports = { generate, generateFromFields, classifyResource };
