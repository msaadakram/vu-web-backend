const express = require('express');
const { body } = require('express-validator');
const resourceController = require('../controllers/resourceController');
const { protect } = require('../middleware/auth');
const upload = require('../config/multer');

const router = express.Router();

router
  .route('/')
  .get(resourceController.getAll)
  .post(
    protect,
    upload.single('file'),
    [
      body('title').trim().notEmpty().withMessage('Title is required'),
      body('type').notEmpty().withMessage('Type is required'),
    ],
    resourceController.upload
  );

router
  .route('/:id')
  .get(resourceController.getOne)
  .delete(protect, resourceController.remove);

router.get('/:id/download', resourceController.download);
router.get('/:id/download-link', resourceController.downloadLink);

module.exports = router;
