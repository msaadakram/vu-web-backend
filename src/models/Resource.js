const mongoose = require('mongoose');

const RESOURCE_TYPES = ['assignment', 'past-paper', 'handout', 'notes', 'other'];

const resourceSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: [true, 'Title is required'],
      trim: true,
    },
    description: {
      type: String,
      trim: true,
      default: '',
    },
    type: {
      type: String,
      enum: [...RESOURCE_TYPES],
      required: [true, 'Type is required'],
      index: true,
    },
    course: {
      type: String,
      trim: true,
      default: '',
      index: true,
    },
    // e.g. "2024", "Spring 2024" — useful for past papers
    semester: {
      type: String,
      trim: true,
      default: '',
    },
    file: {
      key: { type: String, required: true },
      originalName: { type: String, required: true },
      mimeType: { type: String, required: true },
      size: { type: Number, required: true },
      url: { type: String, default: '' },
    },
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    blog: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'BlogPost',
      default: null,
    },
  },
  { timestamps: true }
);

resourceSchema.index({ title: 'text', description: 'text', course: 'text' });

module.exports = mongoose.model('Resource', resourceSchema);
module.exports.RESOURCE_TYPES = RESOURCE_TYPES;
