"""Build the CloudFormation template for a one-off import against this deployment only."""


def template(outputs, bucket, snapshot, release_prefix):
    def role(service, statements):
        return {"Type": "AWS::IAM::Role", "Properties": {
            "AssumeRolePolicyDocument": {"Version": "2012-10-17", "Statement": [
                {"Effect": "Allow", "Action": "sts:AssumeRole", "Principal": {"Service": service},
                 "Condition": {"StringEquals": {"aws:SourceAccount": {"Ref": "AWS::AccountId"}}}}]},
            "Policies": [{"PolicyName": "Import", "PolicyDocument": {"Version": "2012-10-17", "Statement": statements}}]}}

    def allow(action, resource):
        return {"Effect": "Allow", "Action": action, "Resource": resource}

    paths = {f: release_prefix + f for f in ["restore.sh", "verification.sql", "rds.pem", "snapshot.sha256"]}
    paths["snapshot.sql.gz"] = snapshot
    def log(name):
        return {"LogDriver": "awslogs", "Options": {"awslogs-group": {"Ref": "Log"}, "awslogs-region": "us-east-1", "awslogs-stream-prefix": name}}

    mount = {"SourceVolume": "transfer", "ContainerPath": "/transfer"}
    fetch = " && ".join(f"aws s3api get-object --expected-bucket-owner \"$BUCKET_OWNER\" --bucket {bucket} --key {key} /transfer/{name} >/dev/null" for name, key in paths.items())
    resources = {
        "Cluster": {"Type": "AWS::ECS::Cluster", "Properties": {"ClusterName": "terrabovina-aws"}},
        "Log": {"Type": "AWS::Logs::LogGroup", "Properties": {"RetentionInDays": 7}},
        "Execution": role("ecs-tasks.amazonaws.com", [
            allow(["logs:CreateLogStream", "logs:PutLogEvents"], {"Fn::GetAtt": ["Log", "Arn"]}),
            allow("secretsmanager:GetSecretValue", [outputs["AppSecret"], outputs["MasterSecret"]])]),
        "Reader": role("ecs-tasks.amazonaws.com", [allow("s3:GetObject", [f"arn:aws:s3:::{bucket}/{key}" for key in paths.values()])]),
        "Import": {"Type": "AWS::ECS::TaskDefinition", "Properties": {
            "Family": "terrabovina-aws-restore", "NetworkMode": "awsvpc", "RequiresCompatibilities": ["FARGATE"],
            "Cpu": "256", "Memory": "1024", "ExecutionRoleArn": {"Fn::GetAtt": ["Execution", "Arn"]},
            "TaskRoleArn": {"Fn::GetAtt": ["Reader", "Arn"]}, "Volumes": [{"Name": "transfer"}],
            "ContainerDefinitions": [
                {"Name": "fetch", "Essential": False, "Image": "public.ecr.aws/aws-cli/aws-cli:latest",
                 "EntryPoint": ["/bin/sh", "-ec"], "Command": [fetch], "MountPoints": [mount], "LogConfiguration": log("restore")},
                {"Name": "restore", "Essential": True, "Image": "public.ecr.aws/docker/library/mysql:9.4.0",
                 "DependsOn": [{"ContainerName": "fetch", "Condition": "SUCCESS"}],
                 "EntryPoint": ["/bin/bash", "/transfer/restore.sh"], "MountPoints": [{**mount, "ReadOnly": True}],
                 "Environment": [{"Name": "DB_HOST", "Value": outputs["Host"]}, {"Name": "DB_NAME", "Value": "terrabovina_aws"}],
                 "Secrets": [{"Name": "MYSQL_PWD", "ValueFrom": outputs["MasterSecret"] + ":password::"},
                             {"Name": "APP_PASSWORD", "ValueFrom": outputs["AppSecret"]}], "LogConfiguration": log("restore")}]}}}
    resources["Import"]["Properties"]["ContainerDefinitions"][0]["Environment"] = [{"Name": "BUCKET_OWNER", "Value": {"Ref": "AWS::AccountId"}}]
    return {"AWSTemplateFormatVersion": "2010-09-09", "Resources": resources,
            "Outputs": {n: {"Value": {"Ref": n}} for n in ["Cluster", "Import", "Log"]}}
