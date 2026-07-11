const mongoose = require('mongoose');

const blogPostSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      index: true,
      maxlength: [100, 'Slug must be 100 characters or fewer'],
    },
    excerpt: {
      type: String,
      default: '',
    },
    category: {
      type: String,
      default: 'General',
      index: true,
    },
    tags: {
      type: [String],
      default: [],
    },
    keywords: {
      type: [String],
      default: [],
    },
    metaTitle: {
      type: String,
      default: '',
      maxlength: [60, 'metaTitle must be 60 characters or fewer'],
    },
    metaDescription: {
      type: String,
      default: '',
      maxlength: [160, 'metaDescription must be 160 characters or fewer'],
    },
    readTime: {
      type: String,
      default: '5 min read',
    },
    intro: {
      type: String,
      default: '',
    },
    keyTakeaways: {
      type: [String],
      default: [],
    },
    sections: [
      {
        number: { type: String, default: '' },
        heading: { type: String, required: true },
        body: { type: String, required: true },
        keyPoints: { type: [String], default: [] },
      },
    ],
    relatedConcepts: {
      type: [String],
      default: [],
    },
    faq: [
      {
        question: { type: String, required: true },
        answer: { type: String, required: true },
      },
    ],
    // 'blog'    — standalone AI blog post (no resource required)
    // 'resource' — blog post generated from an uploaded resource
    // 'news'    — news / announcement post
    type: {
      type: String,
      enum: ['blog', 'resource', 'news'],
      default: 'resource',
      index: true,
    },
    resource: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Resource',
      index: true,
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    status: {
      type: String,
      enum: ['generating', 'published', 'failed'],
      default: 'generating',
      index: true,
    },
    // Explicit publish date — used for sitemap lastModified & Google freshness signals
    publishedAt: {
      type: Date,
      default: null,
    },
    aiModel: {
      type: String,
      default: '',
    },
    errorMessage: {
      type: String,
      default: '',
    },
    coverImage: {
      type: String,
      default: '',
    },
    coverImageKey: {
      type: String,
      default: '',
    },
  },
  { timestamps: true }
);

// Full-text search index
blogPostSchema.index({ title: 'text', excerpt: 'text', tags: 'text', category: 'text' });

module.exports = mongoose.models.BlogPost || mongoose.model('BlogPost', blogPostSchema);
