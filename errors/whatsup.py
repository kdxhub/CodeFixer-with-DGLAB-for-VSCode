import os
import sys
from math import sqrt
import nonexistent_module               # Error: 无法解析的导入

def myFunction():                       # Warning: 函数名应为小写（PEP8）
    a = 10
    b = 20
    c = a + b                           # Warning: 变量 c 未使用
    return a

def calculate(x, y):
    result = x + y
    return result

def test():
    print("Hello")
   print("Wrong indentation")           # Error: 缩进不一致（混合空格与制表符）

print(undefined_var)                    # Error: 未定义变量

def func(a, b):
    return a + b

func(1)                                 # Error: 缺少必需的位置参数 b

num = "10"
result = num + 5                        # Warning: 类型不匹配（str + int）

x = None
if x == None:                           # Warning: 与 None 比较应使用 'is'
    pass

import datetime                         # Warning: 未使用的导入

list = [1, 2, 3]                        # Warning: 覆盖内置名称 'list'

long_line = "This line exceeds the recommended 79 characters limit and should trigger a line-too-long warning from most linters."  # Warning: 行太长

class MyClass:                           # Info: 缺少类 docstring
    def __init__(self, value):
        self.value = value

    def method(self):
        pass                             # Info: 缺少方法 docstring

def greet(name: str) -> str:
    return "Hello " + name

greet(123)                               # Info: 实参类型与类型注解不匹配

d = {1: 'a', 1: 'b'}                     # Warning: 字典中重复的键

def unused_param(a, b, c):               # Warning: 参数 c 未使用
    return a + b

if some_condition:                       # Error: 变量 'some_condition' 未定义
    y = 10
print(y)                                 # Error: 变量 'y' 可能未定义

print("Missing parenthesis"              # Error: 缺少右括号

if x > 5                                 # Error: 缺少冒号
    print("x > 5")

def mixed_indent():
    print("spaces")
	print("tabs")                         # Error: 混合使用空格和制表符

def foo():
    pass
  print("This line has bad indent")      # Error: 缩进错误

def same_name():
    pass

def same_name():                         # Warning: 函数重定义
    pass

unused_comprehension = [j for j in range(5)]  # Warning: 变量未使用

print(math.pi)                           # Error: 未导入 math 模块

def divide(a: int, b: int) -> int:
    return a / b                         # Warning: 返回类型不匹配（实际返回 float）

def append_to(element, target=[]):       # Warning: 默认参数使用可变对象
    target.append(element)
    return target

a = 5
b = "10"
c = a + b                                # Warning: 类型不匹配

id = 1                                   # Warning: 覆盖内置名称 'id'

def error_func():
    print(inner_var)                     # Error: 局部变量 'inner_var' 在赋值前引用
    inner_var = 5

d2 = {[1, 2]: 'value'}                   # Error: 列表是不可哈希类型，不能作为字典键

s = {1, 2, 3, 1}                         # Warning: 集合字面量中的重复元素（部分linter会提示）

import os
os.nonexistent_attr                      # Error: 模块 'os' 没有属性 'nonexistent_attr'

from typing import List
def process(items: List[int]) -> None:
    for item in items:
        print(item)                      # 无问题，但可增加 Info 提示点

obj = MyUndefinedClass()                 # Error: 名称 'MyUndefinedClass' 未定义

def func_finally():
    try:
        return 1
    finally:
        return 2                         # Warning: finally 块中的 return 会覆盖之前的 return