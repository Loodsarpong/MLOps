variable "name" { type = string }

resource "aws_cognito_user_pool" "this" {
  name = var.name
  password_policy {
    minimum_length    = 12
    require_symbols   = true
    require_numbers   = true
    require_uppercase = true
    require_lowercase = true
  }
  mfa_configuration = "OPTIONAL"
  software_token_mfa_configuration { enabled = true }
  schema {
    name                = "tenant_id"
    attribute_data_type = "String"
    mutable             = false
    required            = false
  }
  schema {
    name                = "roles"
    attribute_data_type = "String"
    mutable             = true
    required            = false
  }
  account_recovery_setting {
    recovery_mechanism { name = "verified_email"; priority = 1 }
  }
}

resource "aws_cognito_user_pool_client" "web" {
  name         = "${var.name}-web"
  user_pool_id = aws_cognito_user_pool.this.id
  generate_secret = false
  allowed_oauth_flows_user_pool_client = true
  allowed_oauth_flows  = ["code"]
  allowed_oauth_scopes = ["openid", "email", "profile"]
  callback_urls        = ["https://app.naturalshea.care/auth/callback"]
  logout_urls          = ["https://app.naturalshea.care/"]
  supported_identity_providers = ["COGNITO"]
}

output "user_pool_id"  { value = aws_cognito_user_pool.this.id }
output "app_client_id" { value = aws_cognito_user_pool_client.web.id }
output "issuer"        { value = "https://cognito-idp.${data.aws_region.current.name}.amazonaws.com/${aws_cognito_user_pool.this.id}" }
data "aws_region" "current" {}
