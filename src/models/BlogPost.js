const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

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
    },
    metaDescription: {
      type: String,
      default: '',
    },
    readTime: {
      type: String,
      default: '5 min read',
    },
    sections: [
      {
        heading: { type: String, required: true },
        body: { type: String, required: true },
      },
    ],
    faq: [
      {
        question: { type: String, required: true },
        answer: { type: String, required: true },
      },
    ],
    type: {
      type: String,
      enum: ['resource', 'news'],
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

blogPostSchema.index({ title: 'text', excerpt: 'text', tags: 'text', category: 'text' });

module.exports = mongoose.model('BlogPost', blogPostSchema);
