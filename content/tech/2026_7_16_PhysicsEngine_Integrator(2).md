---
title: "物理引擎开发-Integrator的探索(2)"
date: 2026-07-16T02:50:00+08:00
draft: false
tags: []
categories: ["tech"]
summary: ""
cover: ""
comments: true
math: true
---

# 物理引擎开发-Integrator的探索(2)

上一篇中，我把高阶 ODE、非线性系统和空间离散后的 PDE 统一为：

\[
\mathbf y'=\mathbf f(t,\mathbf y)
\]

但“形式统一”并不意味着所有系统都适合使用同一种时间推进格式。

对于简谐振子、单摆和行星轨道这类保守系统，真正重要的不只是单步误差，还包括数值方法是否保留原系统的长期几何结构。

这一篇从显式 Euler 在简谐振子上的失稳出发，继续讨论：

- 矩阵指数与精确状态转移；
- 相空间面积与辛条件；
- `symplectic` 的词源；
- Kick–Drift–Kick 的构造；
- 行星轨道的 Velocity Verlet；
- 拉格朗日形式与哈密顿形式的区别。

---

## 1. 简谐振子暴露了显式 Euler 的结构问题

考虑简谐振子：

\[
q''+\omega^2q=0
\]

定义：

\[
\mathbf y=
\begin{bmatrix}
q\\
v
\end{bmatrix}
\]

则：

\[
\mathbf y' =
A\mathbf y,\qquad
A=
\begin{bmatrix}
0&1\\
-\omega^2&0
\end{bmatrix}
\]

精确解经过时间 \(h\) 的更新为：

\[
\mathbf y(t+h)=e^{hA}\mathbf y(t)
\]

矩阵指数定义为：

\[
e^{hA} =
I+hA+\frac{(hA)^2}{2!}
+\frac{(hA)^3}{3!}+\cdots
\]

由于：

\[
A^2=-\omega^2I
\]

可以将偶数项和奇数项分别整理成余弦和正弦级数，最终得到：

\[
\boxed{
e^{hA} =
\begin{bmatrix}
\cos(\omega h)&\dfrac{\sin(\omega h)}{\omega}\\
-\omega\sin(\omega h)&\cos(\omega h)
\end{bmatrix}
}
\]

这个精确更新矩阵满足：

\[
\det(e^{hA})=1
\]

其特征值为：

\[
e^{\pm i\omega h}
\]

模长恒为 1，所以解析解始终有界、周期振荡。

显式 Euler 的更新矩阵为：

\[
M_E=I+hA =
\begin{bmatrix}
1&h\\
-\omega^2h&1
\end{bmatrix}
\]

其行列式：

\[
\boxed{
\det M_E=1+\omega^2h^2>1
}
\]

特征值为：

\[
1\pm i\omega h
\]

模长：

\[
\sqrt{1+\omega^2h^2}>1
\]

因此，显式 Euler 每一步都在相空间中人为放大面积，长期轨迹会向外螺旋。

这里的问题不在简谐振子本身，而在离散更新映射没有继承连续系统的几何结构。

---

## 2. 辛积分器到底是什么

`symplectic` 可以拆成：

\[
\text{sym-}+\text{plect-}+\text{-ic}
\]

其中：

- `sym-`：共同、一起；
- `plect-`：编织、交织；
- `-ic`：形容词后缀。

词源上可以理解为：

\[
\boxed{
\text{交织在一起的}
}
\]

在哈密顿力学中，位置 \(q\) 和共轭动量 \(p\) 并不是两组互不相关的变量，而是通过反对称结构彼此耦合。

对于一个自由度：

\[
z=
\begin{bmatrix}
q\\
p
\end{bmatrix}
\]

定义：

\[
J=
\begin{bmatrix}
0&1\\
-1&0
\end{bmatrix}
\]

哈密顿方程可写成：

\[
\boxed{
\dot z=J\nabla H(z)
}
\]

取两个微小扰动向量 \(u,v\)，则：

\[
u^TJv
\]

表示它们在 \(q-p\) 相平面中张成的有向面积。

如果数值更新映射的 Jacobian 为 \(S\)，那么扰动经过一步更新后变成：

\[
u_{\text{new}}=Su,\qquad
v_{\text{new}}=Sv
\]

更新后的辛面积为：

\[
(Su)^TJ(Sv) =
u^TS^TJSv
\]

如果要求它对任意 \(u,v\) 都与原来相等：

\[
u^TS^TJSv=u^TJv
\]

就必须有：

\[
\boxed{
S^TJS=J
}
\]

这就是辛映射的矩阵条件。

在二维情况下，它等价于：

\[
\det S=1
\]

即保持相平面有向面积。

但在更高维情况下，\(\det S=1\) 只代表保总体积，并不足以保证辛。辛结构还要求保持每一对共轭变量之间的几何关系。

---

## 3. 如何真正构造一个辛积分器

重要的是：

> \(S^TJS=J\) 更适合用来验证，而不是用来凭空猜测积分格式。

实用的构造方法是：

\[
\boxed{
\text{写出哈密顿量}
\rightarrow
\text{分裂哈密顿量}
\rightarrow
\text{精确推进子系统}
\rightarrow
\text{复合子流}
}
\]

考虑可分离哈密顿量：

\[
H(q,p)=T(p)+V(q)
\]

动能部分：

\[
H=T(p)
\]

对应：

\[
\dot q=\frac{\partial T}{\partial p},\qquad
\dot p=0
\]

所以它可以精确推进：

\[
q_{\text{new}} =
q+h\frac{\partial T}{\partial p}
\]

这一步称为 Drift。

势能部分：

\[
H=V(q)
\]

对应：

\[
\dot q=0,\qquad
\dot p=-\frac{\partial V}{\partial q}
\]

所以可以精确推进：

\[
p_{\text{new}} =
p-h\frac{\partial V}{\partial q}
\]

这一步称为 Kick。

对称组合：

\[
\boxed{
\text{Kick}_{h/2}
\rightarrow
\text{Drift}_{h}
\rightarrow
\text{Kick}_{h/2}
}
\]

就是 Velocity Verlet。

由于每个子步骤都是某个哈密顿子系统的精确流，而精确哈密顿流是辛的，辛映射的复合仍然辛，因此整个算法天然保持辛结构。

---

## 4. 行星轨道中的辛积分器

考虑单位质量的二维开普勒问题：

\[
H(\mathbf r,\mathbf p) =
\frac12|\mathbf p|^2 -
\frac{\mu}{|\mathbf r|}
\]

其中：

\[
\mathbf r=
\begin{bmatrix}
x\\y
\end{bmatrix},
\qquad
\mathbf p=
\begin{bmatrix}
v_x\\v_y
\end{bmatrix}
\]

哈密顿量天然分裂成：

\[
T(\mathbf p)=\frac12|\mathbf p|^2
\]

和：

\[
V(\mathbf r)=-\frac{\mu}{|\mathbf r|}
\]

哈密顿方程是：

\[
\dot{\mathbf r}=\mathbf p
\]

\[
\dot{\mathbf p} =
-\mu\frac{\mathbf r}{|\mathbf r|^3}
\]

Velocity Verlet 为：

\[
\mathbf v_{n+\frac12} =
\mathbf v_n -
\frac h2
\mu\frac{\mathbf r_n}{|\mathbf r_n|^3}
\]

\[
\mathbf r_{n+1} =
\mathbf r_n+h\mathbf v_{n+\frac12}
\]

\[
\mathbf v_{n+1} =
\mathbf v_{n+\frac12} -
\frac h2
\mu\frac{\mathbf r_{n+1}}{|\mathbf r_{n+1}|^3}
\]

代码结构：

```cpp
struct State
{
    Eigen::Vector2d r;
    Eigen::Vector2d v;
};

Eigen::Vector2d gravityAcceleration(
    const Eigen::Vector2d& r,
    double mu)
{
    const double radius = r.norm();
    return -mu * r / (radius * radius * radius);
}

State velocityVerletStep(
    const State& state,
    double h,
    double mu)
{
    const Eigen::Vector2d a0 =
        gravityAcceleration(state.r, mu);

    const Eigen::Vector2d vHalf =
        state.v + 0.5 * h * a0;

    const Eigen::Vector2d rNext =
        state.r + h * vHalf;

    const Eigen::Vector2d a1 =
        gravityAcceleration(rNext, mu);

    const Eigen::Vector2d vNext =
        vHalf + 0.5 * h * a1;

    return {
        rNext,
        vNext
    };
}
```

这里最关键的不是手工计算更新矩阵的行列式，而是识别出：

\[
H=T(p)+V(q)
\]

并把系统拆成可以分别精确推进的 Kick 和 Drift。

---

## 5. 拉格朗日形式与哈密顿形式

拉格朗日量通常写成：

\[
\boxed{
L(q,\dot q,t)=T-V
}
\]

它使用位置和速度。

运动方程由 Euler-Lagrange 方程给出：

\[
\boxed{
\frac{d}{dt}
\left(
\frac{\partial L}{\partial\dot q_i}
\right) -
\frac{\partial L}{\partial q_i}
=0
}
\]

定义共轭动量：

\[
\boxed{
p_i=\frac{\partial L}{\partial\dot q_i}
}
\]

然后通过 Legendre 变换定义哈密顿量：

\[
\boxed{
H(q,p,t) =
\sum_i p_i\dot q_i-L(q,\dot q,t)
}
\]

哈密顿方程为：

\[
\boxed{
\dot q_i=\frac{\partial H}{\partial p_i}
}
\]

\[
\boxed{
\dot p_i=-\frac{\partial H}{\partial q_i}
}
\]

对于普通机械系统：

\[
L=\frac12m\dot q^2-V(q)
\]

有：

\[
p=m\dot q
\]

因此：

\[
H=\frac{p^2}{2m}+V(q)
\]

这时哈密顿量恰好等于总机械能。

但需要注意：

- 拉格朗日量不是总能量；
- 共轭动量不一定等于机械动量；
- 哈密顿量也不总是简单的 \(T+V\)。

拉格朗日形式更适合从广义坐标和约束出发建立模型，而哈密顿形式更适合相空间分析、守恒量研究和辛积分器构造。

---

## 6. 术语本身也影响理解

这次讨论中另一个明显感受是，很多中文数学术语几乎不提供直觉。

例如：

- 辛：symplectic，词源上是共同编织；
- 酉：unitary，与 unit、单位长度和内积保持有关；
- 正交：orthogonal，词根直接指向正角；
- 特征值：eigenvalue，其中德语 eigen 表示自身的、固有的。

中文译名适合建立统一术语体系，但常常会切断词源中的图像感。

更有效的学习顺序可能是：

\[
\boxed{
\text{中文术语}
\rightarrow
\text{原文术语}
\rightarrow
\text{词根与历史}
\rightarrow
\text{严格定义}
\rightarrow
\text{最简单例子}
\rightarrow
\text{它保持了什么}
}
\]

例如辛结构：

\[
\text{symplectic}
\rightarrow
\text{共同编织}
\rightarrow
S^TJS=J
\rightarrow
\text{保持 }dq\wedge dp
\rightarrow
\text{一自由度下保持相面积}
\]

当术语的神秘感被拆开之后，概念本身往往比名字更接近直觉。

---

---

## 7. 本篇总结

显式 Euler 在简谐振子上的发散，并不是物理系统本身不稳定，而是离散更新矩阵满足：

\[
\det(I+hA)>1
\]

它在每一步都人为放大相空间面积。

辛积分器的目标不是严格保持每一步的原始能量，而是保持哈密顿系统的相空间结构：

\[
\boxed{
S^TJS=J
}
\]

在可分离哈密顿量

\[
H(q,p)=T(p)+V(q)
\]

下，可以分别精确推进动能流和势能流，再使用对称复合：

\[
\boxed{
\text{Kick}_{h/2}
\rightarrow
\text{Drift}_{h}
\rightarrow
\text{Kick}_{h/2}
}
\]

从而得到 Velocity Verlet。

这说明构造积分器时，真正应该关注的是系统本身的结构：

- 普通非刚性系统关注局部误差；
- 刚性系统关注稳定域；
- 哈密顿系统关注辛结构；
- 约束系统关注约束漂移；
- 守恒律 PDE 关注离散守恒。

Integrator 的设计最终不是“选择一个最高阶的方法”，而是：

\[
\boxed{
\text{选择与问题结构相匹配的时间离散方法}
}
\]
