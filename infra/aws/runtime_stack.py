"""CloudFormation for the application tier, generated with the outputs of the isolated stacks."""


def template(db, cluster, backend_image, model_image, domain="aws.terrabovina.com.ar", certificate=None, zone=None):
    def ref(name):
        return {"Ref": name}

    def attr(name, key):
        return {"Fn::GetAtt": [name, key]}

    def sub(value):
        return {"Fn::Sub": value}

    def resource(kind, **props):
        return {"Type": "AWS::" + kind, "Properties": props}

    def allow(actions, resources):
        return {"Effect": "Allow", "Action": actions, "Resource": resources}

    def iam(service, statements):
        trust = {"Effect": "Allow", "Principal": {"Service": service}, "Action": "sts:AssumeRole"}
        if service == "ecs-tasks.amazonaws.com":
            trust["Condition"] = {"StringEquals": {"aws:SourceAccount": ref("AWS::AccountId")}}
        return resource("IAM::Role", AssumeRolePolicyDocument={"Version": "2012-10-17", "Statement": [trust]},
                        Policies=[{"PolicyName": "TerraBovinaRuntime", "PolicyDocument": {"Version": "2012-10-17", "Statement": statements}}])

    def bucket():
        return {**resource("S3::Bucket", BucketEncryption={"ServerSideEncryptionConfiguration": [
            {"ServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}}]},
            OwnershipControls={"Rules": [{"ObjectOwnership": "BucketOwnerEnforced"}]},
            PublicAccessBlockConfiguration=dict.fromkeys(["BlockPublicAcls", "BlockPublicPolicy", "IgnorePublicAcls", "RestrictPublicBuckets"], True)),
            "DeletionPolicy": "Retain", "UpdateReplacePolicy": "Retain"}

    def endpoint(name):
        return resource("ApiGatewayV2::Api", Name="terrabovina-aws-" + name, ProtocolType="HTTP")

    def stage(api):
        return resource("ApiGatewayV2::Stage", ApiId=ref(api), StageName="$default", AutoDeploy=True,
                        DefaultRouteSettings={"ThrottlingBurstLimit": 20, "ThrottlingRateLimit": 10})

    def route(api, key, integration, auth="NONE"):
        return resource("ApiGatewayV2::Route", ApiId=ref(api), RouteKey=key, AuthorizationType=auth,
                        Target=sub("integrations/${" + integration + "}"))

    def logs(prefix):
        return {"LogDriver": "awslogs", "Options": {"awslogs-group": ref("Logs"), "awslogs-region": "us-east-1", "awslogs-stream-prefix": prefix}}

    def env(settings):
        return [{"Name": k, "Value": v} for k, v in settings.items()]

    r = {}
    r["Logs"] = resource("Logs::LogGroup", RetentionInDays=7)
    r["ModelLog"] = resource("Logs::LogGroup", LogGroupName="/aws/lambda/terrabovina-aws-modelos", RetentionInDays=7)
    r["Web"] = bucket()
    r["Assets"] = bucket()
    r["LambdaRole"] = iam("lambda.amazonaws.com", [allow(["logs:CreateLogStream", "logs:PutLogEvents"], attr("ModelLog", "Arn"))])
    r["Model"] = resource("Lambda::Function", FunctionName="terrabovina-aws-modelos", Role=attr("LambdaRole", "Arn"),
                          PackageType="Image", Code={"ImageUri": model_image}, Architectures=["x86_64"],
                          Timeout=30, MemorySize=2048, EphemeralStorage={"Size": 1024},
                          Environment={"Variables": {"PORT": "5000", "OPENBLAS_NUM_THREADS": "1", "OMP_NUM_THREADS": "1"}})
    r["ModelApi"] = endpoint("modelos")
    r["ModelStage"] = stage("ModelApi")
    r["ModelIntegration"] = resource("ApiGatewayV2::Integration", ApiId=ref("ModelApi"), IntegrationType="AWS_PROXY",
                                     IntegrationUri=attr("Model", "Arn"), PayloadFormatVersion="2.0", TimeoutInMillis=30000)
    for suffix in ["dmi", "dmp"]:
        r[suffix.upper()] = route("ModelApi", "POST /predict/" + suffix, "ModelIntegration", "AWS_IAM")
    model_arns = [sub("arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${ModelApi}/$default/POST/predict/" + t) for t in ("dmi", "dmp")]
    r["InvokePermission"] = resource("Lambda::Permission", Action="lambda:InvokeFunction", FunctionName=ref("Model"),
                                     Principal="apigateway.amazonaws.com", SourceArn=sub("arn:${AWS::Partition}:execute-api:${AWS::Region}:${AWS::AccountId}:${ModelApi}/*/POST/predict/*"))
    r["TaskRole"] = iam("ecs-tasks.amazonaws.com", [
        allow("execute-api:Invoke", model_arns),
        {**allow("ses:SendEmail", sub("arn:${AWS::Partition}:ses:${AWS::Region}:${AWS::AccountId}:identity/" + domain)),
         "Condition": {"StringEquals": {"ses:FromAddress": "cuentas@" + domain}}}])
    r["Execution"] = iam("ecs-tasks.amazonaws.com", [
        allow("ecr:GetAuthorizationToken", "*"),
        allow(["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability"],
              [sub("arn:${AWS::Partition}:ecr:${AWS::Region}:${AWS::AccountId}:repository/terrabovina-aws/" + k) for k in ["backend", "modelos"]]),
        allow(["logs:CreateLogStream", "logs:PutLogEvents"], attr("Logs", "Arn")),
        allow("secretsmanager:GetSecretValue", [db["AppSecret"], db["JwtSecret"]])])
    r["Namespace"] = resource("ServiceDiscovery::PrivateDnsNamespace", Name="terrabovina-aws.internal", Vpc=db["Vpc"])
    r["Discovery"] = resource("ServiceDiscovery::Service", Name="backend", NamespaceId=ref("Namespace"),
                              DnsConfig={"DnsRecords": [{"Type": "SRV", "TTL": 10}], "RoutingPolicy": "MULTIVALUE"},
                              HealthCheckCustomConfig={"FailureThreshold": 1})
    r["BackendApi"] = endpoint("api")
    r["BackendStage"] = stage("BackendApi")
    r["VpcLink"] = resource("ApiGatewayV2::VpcLink", Name="terrabovina-aws", SecurityGroupIds=[db["ApiGroup"]],
                            SubnetIds=[db["PrivateA"], db["PrivateB"]])
    r["BackendIntegration"] = resource("ApiGatewayV2::Integration", ApiId=ref("BackendApi"), ConnectionType="VPC_LINK",
             ConnectionId=ref("VpcLink"), IntegrationType="HTTP_PROXY", IntegrationMethod="ANY", IntegrationUri=attr("Discovery", "Arn"),
             PayloadFormatVersion="1.0", TimeoutInMillis=30000, RequestParameters={"overwrite:path": "$request.path"})
    for name, key in [("AppRoutes", "ANY /api/{proxy+}"), ("Health", "GET /health"), ("Docs", "GET /docs"), ("DocsAssets", "GET /docs/{proxy+}")]:
        r[name] = route("BackendApi", key, "BackendIntegration")
    r["OriginAccess"] = resource("CloudFront::OriginAccessControl", OriginAccessControlConfig={
        "Name": "terrabovina-aws-web", "OriginAccessControlOriginType": "s3", "SigningBehavior": "always", "SigningProtocol": "sigv4"})
    r["Spa"] = resource("CloudFront::Function", Name="terrabovina-aws-spa", AutoPublish=True,
        FunctionConfig={"Comment": "SPA deep links", "Runtime": "cloudfront-js-2.0"},
        FunctionCode="function handler(event){var r=event.request;if(r.uri==='/'||r.uri.split('/').pop().indexOf('.')===-1){r.uri='/index.html';}return r;}")
    behaviors = []
    for pattern in ["/api/*", "/health", "/docs", "/docs/*"]:
        behaviors.append({"PathPattern": pattern, "TargetOriginId": "api", "ViewerProtocolPolicy": "https-only",
            "AllowedMethods": ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"],
            "CachePolicyId": "4135ea2d-6df8-44a3-9df3-4b5a84be39ad",
            "OriginRequestPolicyId": "b689b0a8-53d0-40ab-baf2-68738e2966ac"})
    r["Distribution"] = resource("CloudFront::Distribution", DistributionConfig={
        "Comment": "TerraBovina AWS", "Enabled": True, "HttpVersion": "http2and3", "IPV6Enabled": True,
        "PriceClass": "PriceClass_All", "DefaultRootObject": "index.html",
        "Origins": [
            {"Id": "site", "DomainName": attr("Web", "RegionalDomainName"), "OriginAccessControlId": ref("OriginAccess"), "S3OriginConfig": {"OriginAccessIdentity": ""}},
            {"Id": "api", "DomainName": sub("${BackendApi}.execute-api.${AWS::Region}.${AWS::URLSuffix}"),
             "CustomOriginConfig": {"OriginProtocolPolicy": "https-only", "OriginSSLProtocols": ["TLSv1.2"]}}],
        "DefaultCacheBehavior": {"TargetOriginId": "site", "ViewerProtocolPolicy": "redirect-to-https", "Compress": True,
            "CachePolicyId": "658327ea-f89d-4fab-a63d-7e88639e58f6",
            "FunctionAssociations": [{"EventType": "viewer-request", "FunctionARN": attr("Spa", "FunctionMetadata.FunctionARN")}]},
        "CacheBehaviors": behaviors, "ViewerCertificate": {"CloudFrontDefaultCertificate": True}})
    if certificate and zone:
        config = r["Distribution"]["Properties"]["DistributionConfig"]
        config["Aliases"] = [domain]
        config["ViewerCertificate"] = {"AcmCertificateArn": certificate, "SslSupportMethod": "sni-only", "MinimumProtocolVersion": "TLSv1.2_2021"}
        for record_type in ["A", "AAAA"]:
            r["Frontend" + record_type] = resource("Route53::RecordSet", HostedZoneId=zone, Name=domain, Type=record_type,
                AliasTarget={"DNSName": attr("Distribution", "DomainName"), "HostedZoneId": "Z2FDTNDATAQYW2", "EvaluateTargetHealth": False})
    r["WebPolicy"] = resource("S3::BucketPolicy", Bucket=ref("Web"), PolicyDocument={"Version": "2012-10-17", "Statement": [
        {**allow("s3:GetObject", sub("${Web.Arn}/*")), "Principal": {"Service": "cloudfront.amazonaws.com"},
         "Condition": {"StringEquals": {"AWS:SourceArn": sub("arn:${AWS::Partition}:cloudfront::${AWS::AccountId}:distribution/${Distribution}")}}}]})
    r["Task"] = resource("ECS::TaskDefinition", Family="terrabovina-aws-app", Cpu="512", Memory="2048", NetworkMode="awsvpc",
        RequiresCompatibilities=["FARGATE"], TaskRoleArn=attr("TaskRole", "Arn"), ExecutionRoleArn=attr("Execution", "Arn"),
        ContainerDefinitions=[
            {"Name": "flask", "Image": model_image, "Essential": True, "Environment": env({"PORT":"5000", "OPENBLAS_NUM_THREADS":"1", "OMP_NUM_THREADS":"1"}),
             "LogConfiguration": logs("app"), "HealthCheck": {"Command": ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:5000/health',timeout=3)\""], "Interval":30,"Timeout":5,"Retries":3,"StartPeriod":90}},
            {"Name":"backend", "Image":backend_image,"Essential":True, "PortMappings":[{"ContainerPort":3000,"Protocol":"tcp"}],
             "DependsOn":[{"ContainerName":"flask","Condition":"HEALTHY"}], "LogConfiguration":logs("app"),
             "Environment":env({"NODE_ENV":"production","PORT":"3000","DB_HOST":db["Host"],"DB_PORT":"3306","DB_NAME":"terrabovina_aws","DB_USER":"tb_app",
                                "MODEL_API_BASE_URL":"http://127.0.0.1:5000","MODEL_GATEWAY_URL":attr("ModelApi","ApiEndpoint"),
                                "MODEL_API_TIMEOUT_MS":"15000","MODEL_API_STOCK_JOB_TIMEOUT_MS":"3600000","JWT_EXPIRES_IN":"2h",
                                "STOCK_DAILY_SCHEDULER_ENABLED":"true","MAIL_TRANSPORT":"ses","MAIL_FROM":"cuentas@"+domain,
                                "FRONTEND_URL":"https://"+domain if certificate and zone else sub("https://${Distribution.DomainName}"),"CORS_ORIGINS":"https://"+domain}),
             "Secrets":[{"Name":"DB_PASSWORD","ValueFrom":db["AppSecret"]},{"Name":"JWT_SECRET","ValueFrom":db["JwtSecret"]}],
             "HealthCheck":{"Command":["CMD-SHELL","node -e \"fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))\""],"Interval":30,"Timeout":5,"Retries":3,"StartPeriod":60}}])
    r["Service"] = resource("ECS::Service", Cluster=cluster, DesiredCount=ref("DesiredCount"), LaunchType="FARGATE", PlatformVersion="LATEST",
            ServiceName="terrabovina-aws-api", TaskDefinition=ref("Task"), DeploymentConfiguration={"MaximumPercent": 200,"MinimumHealthyPercent": 100,"DeploymentCircuitBreaker":{"Enable":True,"Rollback":True}},
            NetworkConfiguration={"AwsvpcConfiguration":{"AssignPublicIp":"ENABLED","SecurityGroups":[db["AppGroup"]],"Subnets":[db["PublicA"],db["PublicB"]]}},
            ServiceRegistries=[{"RegistryArn":attr("Discovery","Arn"),"ContainerName":"backend","ContainerPort":3000}])
    return {"AWSTemplateFormatVersion":"2010-09-09","Parameters":{"DesiredCount":{"Type":"Number","AllowedValues":[0,1],"Default":0}},
            "Resources":r,"Outputs":{k:{"Value":v} for k,v in {"WebBucket":ref("Web"),"AssetsBucket":ref("Assets"),"DistributionId":ref("Distribution"),
                "Frontend":attr("Distribution","DomainName"), "ModelApi":attr("ModelApi","ApiEndpoint"),"API":attr("BackendApi","ApiEndpoint"),"Logs":ref("Logs")}.items()}}
