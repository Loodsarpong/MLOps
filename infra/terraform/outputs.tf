output "vpc_id"              { value = module.network.vpc_id }
output "api_alb_dns"          { value = module.ecs_api.alb_dns_name }
output "cloudfront_domain"    { value = module.cdn.domain }
output "rds_endpoint"         { value = module.rds.endpoint }
output "cognito_user_pool_id" { value = module.cognito.user_pool_id }
output "cognito_issuer"       { value = module.cognito.issuer }
output "qbo_sync_queue_url"   { value = aws_sqs_queue.qbo_sync.url }
