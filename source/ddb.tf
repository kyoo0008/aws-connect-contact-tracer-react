# Copyright © Amazon.com and Affiliates: This deliverable is considered Developed Content as defined in the AWS Service Terms and the SOW between the parties dated [March 18, 2024].

locals {
  ddb = {
    // Agent transaction table
    tx_agent = {
      table_name    = "${local.ddb_naming_prefix}-tx-agent"
      partition_key = "pk"
      sort_key      = "sk"
      gsi_messageId = {
        name          = "${local.ddb_naming_prefix}-tx-agent-gsi-messageId"
        partition_key = "messageId"
      }
    }

    // Agent transaction table
    gemini_response = {
      table_name    = "${local.ddb_naming_prefix}-gemini-response"
      partition_key = "pk"
      sort_key      = "sk"
      gsi_contactId = {
        name          = "${local.ddb_naming_prefix}-gemini-response-gsi-contactId"
        partition_key = "contactId"
      }
      gsi_agentId = {
        name          = "${local.ddb_naming_prefix}-gemini-response-gsi-agentId"
        partition_key = "agentId"
      }
      gsi_yearmm = {
        name          = "${local.ddb_naming_prefix}-gemini-response-gsi-yearmm"
        partition_key = "connectedToAgentYYYYMM"
        sort_key      = "connectedToAgentTimestamp"
      }
    }
  }
}

# =================================================================================================
# // Agent Transaction :: DDB table - Agent Transaction Data (Transcript, etc.)
# =================================================================================================
resource "aws_dynamodb_table" "tx_agent" {
  name = local.ddb.tx_agent.table_name

  // Protection
  deletion_protection_enabled = false

  // Capability
  billing_mode     = "PAY_PER_REQUEST"
  table_class      = "STANDARD"
  read_capacity    = 0
  write_capacity   = 0
  stream_enabled   = true
  stream_view_type = "NEW_IMAGE"

  // Key design
  hash_key  = local.ddb.tx_agent.partition_key
  range_key = local.ddb.tx_agent.sort_key
  attribute {
    name = local.ddb.tx_agent.partition_key
    type = "S"
  }
  attribute {
    name = local.ddb.tx_agent.sort_key
    type = "S"
  }

  // GSI attribute
  attribute {
    name = local.ddb.tx_agent.gsi_messageId.partition_key
    type = "S"
  }

  // Index design
  global_secondary_index {
    name               = local.ddb.tx_agent.gsi_messageId.name
    hash_key           = local.ddb.tx_agent.gsi_messageId.partition_key
    range_key          = null
    projection_type    = "ALL"
    non_key_attributes = []
    // Capacity
    read_capacity  = 0
    write_capacity = 0
  }

  // TTL Configuration
  ttl {
    attribute_name = "expireAt"
    enabled        = true
  }

  // etc.
  tags = merge(local.default_resource_tags, {
    # Resource Management
    Service    = "${local.service_prefix}-${trimprefix(local.ddb.tx_agent.table_name, "${local.ddb_naming_prefix}-")}" # overwrite for o11y-filter
    Severity   = "s4"                                                                                                  # TODO: refine severity level
    Backup-ddb = "false"
    PITR       = "false"
  })
}

resource "aws_dynamodb_table" "gemini_response" {
  name  = local.ddb.gemini_response.table_name
  count = var.env != "prd" ? 1 : 0

  // Protection
  deletion_protection_enabled = false

  // Capability
  billing_mode     = "PAY_PER_REQUEST"
  table_class      = "STANDARD"
  read_capacity    = 0
  write_capacity   = 0
  stream_enabled   = true
  stream_view_type = "NEW_IMAGE"

  // Key design
  hash_key  = local.ddb.gemini_response.partition_key
  range_key = local.ddb.gemini_response.sort_key
  attribute {
    name = local.ddb.gemini_response.partition_key
    type = "S"
  }
  attribute {
    name = local.ddb.gemini_response.sort_key
    type = "S"
  }

  // GSI attributes
  attribute {
    name = local.ddb.gemini_response.gsi_contactId.partition_key
    type = "S"
  }
  attribute {
    name = local.ddb.gemini_response.gsi_agentId.partition_key
    type = "S"
  }
  attribute {
    name = local.ddb.gemini_response.gsi_yearmm.partition_key
    type = "S"
  }

  // Index design
  global_secondary_index {
    name               = local.ddb.gemini_response.gsi_contactId.name
    hash_key           = local.ddb.gemini_response.gsi_contactId.partition_key
    range_key          = null
    projection_type    = "ALL"
    non_key_attributes = []
    read_capacity      = 0
    write_capacity     = 0
  }

  global_secondary_index {
    name               = local.ddb.gemini_response.gsi_agentId.name
    hash_key           = local.ddb.gemini_response.gsi_agentId.partition_key
    range_key          = null
    projection_type    = "ALL"
    non_key_attributes = []
    read_capacity      = 0
    write_capacity     = 0
  }

  global_secondary_index {
    name               = local.ddb.gemini_response.gsi_yearmm.name
    hash_key           = local.ddb.gemini_response.gsi_yearmm.partition_key
    range_key          = null
    projection_type    = "ALL"
    non_key_attributes = []
    read_capacity      = 0
    write_capacity     = 0
  }

  // TTL Configuration
  ttl {
    attribute_name = "expireAt"
    enabled        = true
  }

  // etc.
  tags = merge(local.default_resource_tags, {
    # Resource Management
    Service    = "${local.service_prefix}-${trimprefix(local.ddb.gemini_response.table_name, "${local.ddb_naming_prefix}-")}" # overwrite for o11y-filter
    Severity   = var.env == "prd" ? "s1" : "s4"
    Backup-ddb = "false"
    PITR       = "false"
  })
}



# -------------------------------------------------------------------------------------------------
# // Interface / Agent :: DDB table - 결제 정보
# -------------------------------------------------------------------------------------------------
data "aws_dynamodb_table" "tx_payment" {
  name = "${local.ddb_naming_prefix}-tx-payment"
}

# -------------------------------------------------------------------------------------------------
# // Interface / Agent :: DDB table - Agent application
# -------------------------------------------------------------------------------------------------
data "aws_dynamodb_table" "agent" {
  name = "${local.ddb_naming_prefix}-agent-application"
}

# -------------------------------------------------------------------------------------------------
# // Interface / Agent :: DDB table - Agent Contact
# -------------------------------------------------------------------------------------------------
data "aws_dynamodb_table" "contact" {
  name = "${local.ddb_naming_prefix}-agent-contact"
}

# -------------------------------------------------------------------------------------------------
# // Interface / Agent :: DDB table - Message center
# -------------------------------------------------------------------------------------------------
data "aws_dynamodb_table" "message_center" {
  name = "${local.ddb_naming_prefix}-message-center"
}

# -------------------------------------------------------------------------------------------------
# // Interface / Agent :: DDB table - Admin
# -------------------------------------------------------------------------------------------------
data "aws_dynamodb_table" "admin" {
  name = "${local.ddb_naming_prefix}-admin"
}

# -------------------------------------------------------------------------------------------------
# // Interface / Agent :: DDB table - contact event
# -------------------------------------------------------------------------------------------------
data "aws_dynamodb_table" "contact_event" {
  name = "${local.ddb_naming_prefix}-contact-event"
}

# -------------------------------------------------------------------------------------------------
# // Interface / Agent :: DDB table - Agemt Status
# -------------------------------------------------------------------------------------------------
data "aws_dynamodb_table" "agent_status" {
  name = "${local.ddb_naming_prefix}-agent-status"
}
