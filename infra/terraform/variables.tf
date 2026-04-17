variable "environment" {
  description = "Deployment environment"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "prod"], var.environment)
    error_message = "environment must be dev, staging, or prod."
  }
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  type    = string
  default = "10.42.0.0/16"
}

variable "az_count" {
  type    = number
  default = 3
}

variable "db_instance_class" {
  type    = string
  default = "db.t4g.large"
}

variable "db_allocated_storage" {
  type    = number
  default = 100
}

variable "api_desired_count" {
  type    = number
  default = 2
}

variable "api_image" {
  type        = string
  description = "ECR image URI for the API"
}

variable "web_bucket_name" {
  type        = string
  description = "S3 bucket for Next.js static build"
}

variable "domain_name" {
  type        = string
  description = "Primary domain (e.g., naturalshea.care)"
}

variable "alarm_email" {
  type    = string
  default = ""
}

locals {
  name = "ns-${var.environment}"
  common_tags = {
    Project     = "NaturalSheaERP"
    Environment = var.environment
    ManagedBy   = "Terraform"
  }
}
