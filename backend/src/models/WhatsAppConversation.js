const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    role: {
      type: String,
      enum: ['user', 'assistant', 'system'],
      required: true
    },
    content: {
      type: String,
      required: true,
      trim: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: false }
);

const whatsAppConversationSchema = new mongoose.Schema(
  {
    senderId: {
      type: String,
      required: true,
      index: true
    },
    patientId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Patient',
      required: false,
      index: true
    },
    status: {
      type: String,
      enum: ['active', 'completed', 'abandoned'],
      default: 'active',
      index: true
    },
    step: {
      type: String,
      default: 'choose_hospital'
    },
    collectedData: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    options: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    aiPendingQuestions: {
      type: [String],
      default: []
    },
    messages: {
      type: [messageSchema],
      default: []
    },
    lastInteractionAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'whatsapp_conversations'
  }
);

whatsAppConversationSchema.index({ senderId: 1, status: 1, updatedAt: -1 });

module.exports = mongoose.model('WhatsAppConversation', whatsAppConversationSchema);
