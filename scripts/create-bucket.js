require('dotenv').config();
const { S3Client, CreateBucketCommand, HeadBucketCommand, ListBucketsCommand } = require('@aws-sdk/client-s3');

const run = async () => {
  const bucketName = process.env.R2_BUCKET_NAME;
  const endpoint = process.env.R2_ENDPOINT;
  const s3 = new S3Client({
    region: 'auto',
    endpoint,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });

  try {
    await s3.send(new HeadBucketCommand({ Bucket: bucketName }));
    console.log(`Bucket "${bucketName}" already exists.`);
    return;
  } catch (err) {
    if (err.name !== 'NotFound' && err.$metadata?.httpStatusCode !== 404) {
      // fall through to create attempt
      console.log(`Head check: ${err.name} — attempting create`);
    }
  }

  try {
    await s3.send(new CreateBucketCommand({ Bucket: bucketName }));
    console.log(`Bucket "${bucketName}" created.`);
  } catch (err) {
    console.error('Create failed:', err.message);
    process.exit(1);
  }

  const list = await s3.send(new ListBucketsCommand());
  console.log('All buckets:', list.Buckets.map((b) => b.Name).join(', '));
};

run();
