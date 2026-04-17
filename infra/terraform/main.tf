data "aws_availability_zones" "available" { state = "available" }

# ---- Networking ----
module "network" {
  source      = "./modules/network"
  name        = local.name
  cidr        = var.vpc_cidr
  azs         = slice(data.aws_availability_zones.available.names, 0, var.az_count)
  common_tags = local.common_tags
}

# ---- RDS Postgres ----
module "rds" {
  source             = "./modules/rds"
  name               = local.name
  subnet_ids         = module.network.private_subnet_ids
  vpc_id             = module.network.vpc_id
  db_instance_class  = var.db_instance_class
  allocated_storage  = var.db_allocated_storage
  app_security_group = module.ecs_api.task_security_group_id
}

# ---- Redis (ElastiCache) ----
module "redis" {
  source             = "./modules/redis"
  name               = local.name
  subnet_ids         = module.network.private_subnet_ids
  vpc_id             = module.network.vpc_id
  app_security_group = module.ecs_api.task_security_group_id
}

# ---- Cognito ----
module "cognito" {
  source = "./modules/cognito"
  name   = local.name
}

# ---- S3 buckets ----
module "s3_invoices"  { source = "./modules/s3_bucket"; name = "${local.name}-invoices" }
module "s3_imports"   { source = "./modules/s3_bucket"; name = "${local.name}-imports"  }
module "s3_backups"   { source = "./modules/s3_bucket"; name = "${local.name}-backups"  }
module "s3_web"       { source = "./modules/s3_bucket"; name = var.web_bucket_name; public_access = true }

# ---- SQS queues ----
resource "aws_sqs_queue" "qbo_sync_dlq" { name = "${local.name}-qbo-sync-dlq" }
resource "aws_sqs_queue" "qbo_sync" {
  name                      = "${local.name}-qbo-sync"
  message_retention_seconds = 1209600
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.qbo_sync_dlq.arn
    maxReceiveCount     = 5
  })
}
resource "aws_sqs_queue" "email_out" { name = "${local.name}-email-out" }
resource "aws_sqs_queue" "sms_out"   { name = "${local.name}-sms-out" }

# ---- ECS API ----
module "ecs_api" {
  source                = "./modules/ecs_service"
  name                  = "${local.name}-api"
  vpc_id                = module.network.vpc_id
  private_subnet_ids    = module.network.private_subnet_ids
  public_subnet_ids     = module.network.public_subnet_ids
  image                 = var.api_image
  container_port        = 4000
  desired_count         = var.api_desired_count
  cpu                   = 512
  memory                = 1024
  environment = {
    NODE_ENV            = var.environment
    DATABASE_URL        = module.rds.connection_url
    REDIS_URL           = module.redis.connection_url
    S3_INVOICES_BUCKET  = module.s3_invoices.bucket
    S3_IMPORTS_BUCKET   = module.s3_imports.bucket
    SQS_QBO_SYNC_URL    = aws_sqs_queue.qbo_sync.url
    COGNITO_USER_POOL_ID = module.cognito.user_pool_id
    JWT_ISSUER          = module.cognito.issuer
    JWT_AUDIENCE        = module.cognito.app_client_id
  }
  health_check_path = "/v1/health"
  domain_name       = var.domain_name
  alarm_topic_arn   = aws_sns_topic.ops.arn
}

# ---- CloudFront ----
module "cdn" {
  source         = "./modules/cloudfront"
  name           = local.name
  web_bucket     = module.s3_web.bucket
  api_domain     = module.ecs_api.alb_dns_name
  domain_name    = var.domain_name
}

# ---- Ops alerts ----
resource "aws_sns_topic" "ops" { name = "${local.name}-ops-alerts" }
resource "aws_sns_topic_subscription" "ops_email" {
  count     = var.alarm_email == "" ? 0 : 1
  topic_arn = aws_sns_topic.ops.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}
